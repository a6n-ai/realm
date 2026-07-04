import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { buildHandlers, type ChannelHandler } from "./handlers";
import { MAX_ATTEMPTS, nextBackoffMs } from "./policy";

type OutboxRow = typeof notificationOutbox.$inferSelect;

/**
 * Atomically claim up to `limit` due rows (status=pending, backoff elapsed),
 * flipping them to 'processing'. FOR UPDATE SKIP LOCKED lets concurrent
 * drainers run without grabbing the same rows.
 */
async function claim(limit: number, now: number): Promise<OutboxRow[]> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.status, "pending"), lte(notificationOutbox.nextAttemptAt, now)))
      .orderBy(asc(notificationOutbox.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    await tx
      .update(notificationOutbox)
      .set({ status: "processing" })
      .where(inArray(notificationOutbox.id, rows.map((r) => r.id)));
    return rows;
  });
}

async function process(row: OutboxRow, handlers: Record<string, ChannelHandler | undefined>): Promise<void> {
  const handler = handlers[row.channel];
  const attempts = row.attempts + 1;
  try {
    if (!handler) throw new Error(`No handler for channel ${row.channel}`);
    const result = await handler(row);
    // null = skipped (no DB template for this event/channel). Terminal, no retry.
    await db
      .update(notificationOutbox)
      .set(
        result
          ? { status: "sent", attempts, providerMessageId: result.providerMessageId, lastError: null }
          : { status: "sent", attempts, providerMessageId: null, lastError: "skipped: no template" },
      )
      .where(eq(notificationOutbox.id, row.id));
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    const dead = attempts >= MAX_ATTEMPTS;
    await db
      .update(notificationOutbox)
      .set({
        status: dead ? "failed" : "pending",
        attempts,
        lastError,
        nextAttemptAt: Date.now() + nextBackoffMs(attempts),
      })
      .where(eq(notificationOutbox.id, row.id));
  }
}

/** Claim + deliver one batch. Returns how many rows were processed. */
export async function drainOnce(limit = 25): Promise<number> {
  const rows = await claim(limit, Date.now());
  const handlers = buildHandlers();
  await Promise.all(rows.map((r) => process(r, handlers)));
  return rows.length;
}

/** Drain until the queue is empty or `maxBatches` is hit (Lambda entrypoint). */
export async function drainPending(limit = 25, maxBatches = 20): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await drainOnce(limit);
    total += n;
    if (n < limit) break;
  }
  return total;
}
