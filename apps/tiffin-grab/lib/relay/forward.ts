import { and, asc, eq, inArray, lte, min } from "drizzle-orm";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { relayOutbox } from "@/db/schema";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { notifyFrom, notifyReplyTo } from "@/lib/runtime/env";
import { relayRpc, type RelayStream, type RelayTemplateOverride } from "./client";
import { getTemplateOverrides, overrideKey } from "./overrides";
import { renderRelayEmail } from "./render";

const log = createLogger("relay-forward");
// Claimed rows are pushed this far out so no other forwarder picks them up while Relay is being called.
const LEASE_MS = 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_ATTEMPTS = 6;

type Row = typeof relayOutbox.$inferSelect;
type Attachment = { filename: string; url: string; contentType: string };
type Payload = { event: string | null; locale: string; vars: Record<string, unknown>; attachments?: Attachment[] };

// Rows due now, leased in a short transaction. SKIP LOCKED lets two forwarders (queue + cron) run without blocking.
async function claim(limit: number): Promise<Row[]> {
  const now = Date.now();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(relayOutbox)
      .where(and(eq(relayOutbox.status, "pending"), lte(relayOutbox.nextAttemptAt, now)))
      .orderBy(asc(relayOutbox.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length) await tx.update(relayOutbox).set({ nextAttemptAt: now + LEASE_MS }).where(inArray(relayOutbox.id, rows.map((r) => r.id)));
    return rows;
  });
}

// Fetched at forward time: the signed url may be stale at enqueue, and a failed fetch retries like an RPC error.
async function fetchAttachments(list: Attachment[]) {
  return Promise.all(
    list.map(async (a) => {
      const res = await fetch(a.url);
      if (!res.ok) throw new Error(`attachment ${a.filename} fetch ${res.status}`);
      return { filename: a.filename, contentType: a.contentType, content: Buffer.from(await res.arrayBuffer()).toString("base64") };
    }),
  );
}

async function finish(row: Row, status: "sent" | "failed" | "suppressed", fields: Partial<Row> = {}): Promise<"sent" | "failed" | "suppressed"> {
  await db.update(relayOutbox).set({ status, ...fields }).where(eq(relayOutbox.id, row.id));
  return status;
}

/** A failed Relay call retries with backoff; the sixth failure is terminal. */
async function retry(row: Row, lastError: string): Promise<"retry" | "failed"> {
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await finish(row, "failed", { attempts, lastError });
    return "failed";
  }
  await db
    .update(relayOutbox)
    .set({ attempts, lastError, nextAttemptAt: Date.now() + BASE_BACKOFF_MS * 2 ** attempts })
    .where(eq(relayOutbox.id, row.id));
  return "retry";
}

async function deliver(row: Row, overrides: Map<string, RelayTemplateOverride>): Promise<"sent" | "failed" | "suppressed" | "retry"> {
  const payload = row.payload as Payload;
  let rendered;
  try {
    rendered = await renderRelayEmail(
      { event: payload.event ?? "", locale: payload.locale, vars: payload.vars, stream: row.stream as RelayStream },
      overrides.get(overrideKey(payload.event ?? "", payload.locale)) ?? null,
    );
  } catch (err) {
    // A DB hiccup while rendering is transient; only a missing template is worth naming.
    const msg = err instanceof Error && err.message.startsWith("no email template") ? err.message : "render failed";
    return (await retry(row, msg)) === "failed" ? "failed" : "retry";
  }
  if (rendered === "disabled") {
    await finish(row, "failed", { lastError: "template disabled" });
    return "failed";
  }

  const config = row.stream === "marketing" ? await campaignConfig() : null;
  const fallback = notifyFrom();
  try {
    const attachments = await fetchAttachments(payload.attachments ?? []);
    const res = await relayRpc().send({
      stream: row.stream as RelayStream,
      from: config?.sender.email ?? fallback.email,
      fromName: config?.sender.name ?? fallback.name,
      replyTo: notifyReplyTo(),
      to: row.recipientEmail,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      event: payload.event ?? undefined,
      idempotencyKey: row.idempotencyKey,
      ...(attachments.length ? { attachments } : {}),
    });
    // A duplicate means an earlier attempt reached Relay: same outcome as a fresh send.
    const status = res.status === "suppressed" ? "suppressed" : "sent";
    return finish(row, status, { relayMessageId: res.messageId, sentAt: Date.now(), lastError: null });
  } catch (err) {
    const msg = (err as Error).message ?? "relay send failed";
    log.warn({ outboxId: row.publicId, attempts: row.attempts + 1 }, "relay send failed");
    return (await retry(row, msg)) === "failed" ? "failed" : "retry";
  }
}

/**
 * Hands due relay_outbox rows to Relay. Returns how many reached a terminal state and the wait until the next
 * pending row is due (null when none is pending), which the queue consumer uses to schedule its redelivery.
 */
export async function forwardRelayOutbox(limit = 50): Promise<{ sent: number; failed: number; retryAfterMs: number | null }> {
  const claimed = await claim(limit);
  const overrides = claimed.length ? await getTemplateOverrides() : new Map<string, RelayTemplateOverride>();
  let sent = 0;
  let failed = 0;
  for (const row of claimed) {
    const outcome = await deliver(row, overrides);
    if (outcome === "sent") sent++;
    else if (outcome === "failed") failed++;
  }
  const [next] = await db.select({ at: min(relayOutbox.nextAttemptAt) }).from(relayOutbox).where(eq(relayOutbox.status, "pending"));
  const retryAfterMs = next?.at == null ? null : Math.max(0, Number(next.at) - Date.now());
  return { sent, failed, retryAfterMs };
}
