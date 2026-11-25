import { and, eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { messageSuppression, notificationOutbox, relayOutbox } from "@/db/schema";
import type { SendState } from "@/lib/notifications/send-state";
import { relayRpc, type RelayMessageByKey, type RelaySuppressionStatus } from "./client";

export type DeliveryState = {
  key: string;
  status: string;
  sentAt: number | null;
  deliveredAt: number | null;
  bouncedAt: number | null;
  complainedAt: number | null;
  opens: number;
  error: string | null;
};

const CHUNK = 100;
const chunks = <T>(xs: T[]): T[][] => Array.from({ length: Math.ceil(xs.length / CHUNK) }, (_, i) => xs.slice(i * CHUNK, i * CHUNK + CHUNK));
const likePrefix = (prefix: string) => `${prefix.replace(/[\\%_]/g, "\\$&")}%`;

/** Relay's view of a relay_outbox row: Relay wins over the local row when Relay has one; a "skipped" reads as the engine's "sent". */
export function engineStatus(status: string): string {
  return status === "skipped" ? "sent" : status;
}

export function relaySendState(last: (SendState & { key?: string }) | null, state: Map<string, DeliveryState>): SendState | null {
  if (!last) return null;
  const { key, ...base } = last;
  const s = key ? state.get(key) : undefined;
  if (!s) return { ...base, status: engineStatus(base.status) };
  return { status: engineStatus(s.status), at: base.at, deliveredAt: s.deliveredAt, openedAt: s.opens > 0 ? s.sentAt : null };
}

/** Dedupe keys starting with `prefix`, from the engine outbox and relay_outbox, without the ":email" suffix. */
export async function sentKeysWithPrefix(prefix: string): Promise<Set<string>> {
  const pattern = likePrefix(prefix);
  const [engine, relay] = await Promise.all([
    db.select({ key: notificationOutbox.dedupeKey }).from(notificationOutbox).where(like(notificationOutbox.dedupeKey, pattern)),
    db.select({ key: relayOutbox.idempotencyKey }).from(relayOutbox).where(like(relayOutbox.idempotencyKey, pattern)),
  ]);
  const keys = new Set<string>();
  for (const r of engine) if (r.key) keys.add(r.key.replace(/:email$/, ""));
  for (const r of relay) keys.add(r.key.replace(/:email$/, ""));
  return keys;
}

/** Delivery state by relay_outbox.idempotency_key: the local row, overlaid with Relay's view for rows Relay has. A Relay failure keeps the local view. */
export async function deliveryState(keys: string[]): Promise<Map<string, DeliveryState>> {
  const out = new Map<string, DeliveryState>();
  if (keys.length === 0) return out;
  const local = await db
    .select({ key: relayOutbox.idempotencyKey, status: relayOutbox.status, sentAt: relayOutbox.sentAt, error: relayOutbox.lastError, messageId: relayOutbox.relayMessageId })
    .from(relayOutbox)
    .where(inArray(relayOutbox.idempotencyKey, keys));
  for (const r of local) {
    out.set(r.key, { key: r.key, status: r.status, sentAt: r.sentAt, deliveredAt: null, bouncedAt: null, complainedAt: null, opens: 0, error: r.error });
  }
  const remote = local.filter((r) => r.messageId != null).map((r) => r.key);
  try {
    for (const slice of chunks(remote)) {
      const rows: RelayMessageByKey[] = await relayRpc().messagesByKeys(slice);
      for (const m of rows) {
        out.set(m.key, {
          key: m.key,
          status: m.status,
          sentAt: m.sentAt,
          deliveredAt: m.deliveredAt,
          bouncedAt: m.bouncedAt,
          complainedAt: m.complainedAt,
          opens: m.opens,
          error: m.error ?? out.get(m.key)?.error ?? null,
        });
      }
    }
  } catch {
    // Relay unreachable: the local status stands.
  }
  return out;
}

/** Relay's all-stream suppression reason for one address, or null (none, or Relay unreachable: the local table stands). */
export async function relayAllStreamReason(email: string): Promise<RelaySuppressionStatus["reason"] | null> {
  try {
    const found = (await relayRpc().suppressionStatus([email.trim().toLowerCase()])).find((s) => s.stream === null);
    return found?.reason ?? null;
  } catch {
    return null;
  }
}

/** Addresses under an "all"-scope suppression: the engine table, plus Relay's all-stream suppressions (stream null). */
export async function suppressedEmails(emails: string[]): Promise<Set<string>> {
  const addresses = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const out = new Set<string>();
  if (addresses.length === 0) return out;
  for (const slice of chunks(addresses)) {
    const rows = await db
      .select({ address: messageSuppression.address })
      .from(messageSuppression)
      .where(and(inArray(messageSuppression.address, slice), eq(messageSuppression.channel, "email"), eq(messageSuppression.scope, "all")));
    for (const r of rows) out.add(r.address);
  }
  try {
    for (const slice of chunks(addresses)) {
      for (const s of await relayRpc().suppressionStatus(slice)) if (s.stream === null) out.add(s.email.toLowerCase());
    }
  } catch {
    // Relay unreachable: the local table stands.
  }
  return out;
}
