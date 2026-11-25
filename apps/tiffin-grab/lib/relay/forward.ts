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
// settle() guards every write, so a batch that outlives its lease cannot clobber a re-claimed row.
const LEASE_MS = 120_000;
const DEFER_MS = 15_000;
const ATTACHMENT_TIMEOUT_MS = 15_000;
const BATCH = 10;
const BASE_BACKOFF_MS = 30_000;
const MAX_ATTEMPTS = 6;

type Row = typeof relayOutbox.$inferSelect;
type Attachment = { filename: string; url: string; contentType: string };
type Payload = { event: string | null; locale: string; vars: Record<string, unknown>; attachments?: Attachment[] };
type Outcome = "sent" | "suppressed" | "failed" | "skipped" | "retry" | "lost";
type Fields = Partial<Pick<Row, "status" | "attempts" | "lastError" | "nextAttemptAt" | "relayMessageId" | "sentAt">>;

// Rows due now, leased in a short transaction. The returned rows carry the lease value as nextAttemptAt.
// SKIP LOCKED lets two forwarders (queue + cron) run without blocking.
async function claim(limit: number): Promise<Row[]> {
  const now = Date.now();
  const leaseAt = now + LEASE_MS;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(relayOutbox)
      .where(and(eq(relayOutbox.status, "pending"), lte(relayOutbox.nextAttemptAt, now)))
      .orderBy(asc(relayOutbox.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (!rows.length) return [];
    await tx.update(relayOutbox).set({ nextAttemptAt: leaseAt }).where(inArray(relayOutbox.id, rows.map((r) => r.id)));
    return rows.map((r) => ({ ...r, nextAttemptAt: leaseAt }));
  });
}

/** Writes only while this forwarder still holds the lease; a row re-claimed after expiry belongs to its new holder. */
async function settle(row: Row, fields: Fields): Promise<boolean> {
  const done = await db
    .update(relayOutbox)
    .set(fields)
    .where(and(eq(relayOutbox.id, row.id), eq(relayOutbox.status, "pending"), eq(relayOutbox.nextAttemptAt, row.nextAttemptAt)))
    .returning({ id: relayOutbox.id });
  return done.length > 0;
}

// Fetched at forward time: the signed url may be stale at enqueue, and a failed fetch retries like an RPC error.
async function fetchAttachments(list: Attachment[]) {
  return Promise.all(
    list.map(async (a) => {
      const res = await fetch(a.url, { signal: AbortSignal.timeout(ATTACHMENT_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`attachment ${a.filename} fetch ${res.status}`);
      return { filename: a.filename, contentType: a.contentType, content: Buffer.from(await res.arrayBuffer()).toString("base64") };
    }),
  );
}

/** A failed Relay call retries with backoff; the sixth failure is terminal. */
async function retry(row: Row, lastError: string): Promise<Outcome> {
  const attempts = row.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) return (await settle(row, { status: "failed", attempts, lastError })) ? "failed" : "lost";
  const nextAttemptAt = Date.now() + BASE_BACKOFF_MS * 2 ** attempts;
  return (await settle(row, { attempts, lastError, nextAttemptAt })) ? "retry" : "lost";
}

async function deliver(row: Row, overrides: Map<string, RelayTemplateOverride>): Promise<Outcome> {
  const payload = row.payload as Payload;
  const event = payload.event ?? "";
  let rendered;
  try {
    rendered = await renderRelayEmail(
      { event, locale: payload.locale, vars: payload.vars, stream: row.stream as RelayStream },
      overrides.get(overrideKey(event, payload.locale)) ?? overrides.get(overrideKey(event, "en")) ?? null,
    );
  } catch {
    // A DB hiccup or missing footer config is transient, so retry.
    return retry(row, "render failed");
  }
  // Staff turned the template off, or there is none: the engine skips these too, so no retry.
  if (rendered === "disabled" || rendered === "missing") {
    const lastError = rendered === "disabled" ? "template disabled" : "template missing";
    return (await settle(row, { status: "skipped", lastError })) ? "skipped" : "lost";
  }

  const config = row.stream === "marketing" ? await campaignConfig() : null;
  const fallback = notifyFrom();
  let res;
  try {
    const attachments = await fetchAttachments(payload.attachments ?? []);
    res = await relayRpc().send({
      stream: row.stream as RelayStream,
      from: config?.sender.email ?? fallback.email,
      fromName: config?.sender.name ?? fallback.name,
      replyTo: notifyReplyTo(),
      to: row.recipientEmail,
      subject: rendered.subject.replace(/[\r\n]/g, ""),
      html: rendered.html,
      text: rendered.text,
      event: payload.event ?? undefined,
      idempotencyKey: row.idempotencyKey,
      ...(attachments.length ? { attachments } : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "relay send failed";
    log.warn({ outboxId: row.publicId, attempts: row.attempts + 1 }, "relay send failed");
    return retry(row, msg);
  }
  // A duplicate means an earlier attempt reached Relay: same outcome as a fresh send.
  if (res.status === "failed") return (await settle(row, { status: "failed", lastError: "failed", relayMessageId: res.messageId })) ? "failed" : "lost";
  const status = res.status === "suppressed" ? "suppressed" : "sent";
  return (await settle(row, { status, relayMessageId: res.messageId, sentAt: Date.now(), lastError: null })) ? status : "lost";
}

/**
 * Hands due relay_outbox rows to Relay. Returns how many reached a terminal state and the wait until the next
 * pending row is due (null when none is pending), which the queue consumer uses to schedule its redelivery.
 */
export async function forwardRelayOutbox(limit = BATCH): Promise<{ sent: number; failed: number; retryAfterMs: number | null }> {
  const claimed = await claim(limit);
  let sent = 0;
  let failed = 0;
  if (claimed.length) {
    const overrides = await getTemplateOverrides();
    if (overrides) {
      for (const row of claimed) {
        const outcome = await deliver(row, overrides);
        if (outcome === "sent") sent++;
        else if (outcome === "failed") failed++;
      }
    } else {
      // Relay's overrides are unknown, so code defaults could send a template Relay has turned off. Wait instead.
      for (const row of claimed) await settle(row, { nextAttemptAt: Date.now() + DEFER_MS });
    }
  }
  const [next] = await db.select({ at: min(relayOutbox.nextAttemptAt) }).from(relayOutbox).where(eq(relayOutbox.status, "pending"));
  const retryAfterMs = next?.at == null ? null : Math.max(0, Number(next.at) - Date.now());
  return { sent, failed, retryAfterMs };
}
