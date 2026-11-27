import { suppressionKind } from "@relay/engine";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createLogger } from "@foundry/commons/logger";
import { db, type Tx } from "@/db/client";
import { messageSuppression, relayBlockQueue } from "@/db/schema";
import { notifyFrom } from "@/lib/runtime/env";
import { relayRpc, type RelayBlockImportRow, type RelayBlockReason, type RelayBlockSource, type RelayStream } from "./client";

const log = createLogger("relay-blocks");
const IMPORT_BATCH = 500;
const STATUS_BATCH = 100;
// Relay's address rule: one address it refuses fails the whole status call.
const relayEmail = z.string().trim().toLowerCase().max(254).email();

export function toRelayReason(reason: string): RelayBlockReason {
  const kind = suppressionKind(reason);
  return kind === "other" ? "manual" : kind;
}

/** Call inside the transaction that writes the local block, then signalOutbox() after it commits. */
export async function queueBlock(tx: Tx, event: RelayBlockImportRow): Promise<void> {
  await tx.insert(relayBlockQueue).values({ ...event, email: event.email.trim().toLowerCase() });
}

/** Hands queued block events to Relay, oldest first. Never throws: rows stay queued until Relay answers for them. */
export async function pushBlocks(maxBatches = 4): Promise<{ pushed: number; pending: boolean }> {
  let pushed = 0;
  try {
    for (let i = 0; i < maxBatches; i++) {
      const batch = await db.select().from(relayBlockQueue).orderBy(asc(relayBlockQueue.id)).limit(IMPORT_BATCH);
      if (!batch.length) return { pushed, pending: false };
      const { accepted, rejected } = await relayRpc().importSuppressions(
        batch.map(({ id: _, ...row }) => ({
          ...row,
          reason: row.reason as RelayBlockReason,
          stream: row.stream as RelayStream | null,
          source: row.source as RelayBlockSource | null,
          // Relay refuses a longer label, and a refused row is a lost block.
          campaignName: row.campaignName?.slice(0, 500) ?? null,
        })),
      );
      const distinct = new Set(rejected.filter((n) => Number.isInteger(n) && n >= 0 && n < batch.length));
      if (distinct.size !== rejected.length || accepted + rejected.length !== batch.length) {
        throw new Error("relay did not answer for every row");
      }
      // A refused row would be refused again and stall the queue; blockParity reports the local block it came from.
      if (rejected.length) log.error({ rowIds: rejected.map((n) => String(batch[n]?.id)) }, "relay rejected block rows");
      await db.delete(relayBlockQueue).where(inArray(relayBlockQueue.id, batch.map((row) => row.id)));
      pushed += accepted;
      if (batch.length < IMPORT_BATCH) return { pushed, pending: false };
    }
  } catch (err) {
    // The message only: an error object can carry addresses.
    log.warn({ error: err instanceof Error ? err.message : "unknown" }, "relay block push failed");
  }
  return { pushed, pending: true };
}

/** Local email blocks that Relay does not hold with the same reason, on every stream or on the same one. */
export async function blockParity(): Promise<{ checked: number; missing: string[] }> {
  const { campaignConfig } = await import("@/lib/notifications/campaign-config");
  const from = (await campaignConfig())?.sender.email ?? notifyFrom().email;
  const local = await db
    .select({ id: messageSuppression.id, address: messageSuppression.address, scope: messageSuppression.scope, reason: messageSuppression.reason })
    .from(messageSuppression)
    .where(eq(messageSuppression.channel, "email"));
  const emails = [...new Set(local.map((row) => row.address.trim().toLowerCase()))].filter((e) => relayEmail.safeParse(e).success);
  const held = new Set<string>();
  for (let i = 0; i < emails.length; i += STATUS_BATCH) {
    for (const s of await relayRpc().suppressionStatus(emails.slice(i, i + STATUS_BATCH), from)) {
      // A brand opt-out is not the stored block this check looks for.
      if (!s.brandOptOut) held.add(`${s.email.toLowerCase()} ${s.reason} ${s.stream ?? "all"}`);
    }
  }
  const missing = local.filter((row) => {
    const block = `${row.address.trim().toLowerCase()} ${toRelayReason(row.reason)}`;
    return !held.has(`${block} all`) && !held.has(`${block} ${row.scope}`);
  });
  // Ids exceed 2^53, so they travel as strings.
  return { checked: local.length, missing: missing.map((row) => String(row.id)) };
}
