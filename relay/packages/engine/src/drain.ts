import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { MAX_ATTEMPTS, nextBackoffMs } from "./policy";
import type { NotificationTables } from "./schema";
import type { ChannelHandler, OutboxRow } from "./handlers";
import type { Channel } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface RateLimiter {
  /** Consume a token if one is available. Non-blocking. */
  tryTake(): boolean;
  /** Consume a token, waiting for a refill if the bucket is empty. */
  take(): Promise<void>;
}

/**
 * Token bucket capped at one second of capacity.
 *
 * SES throttles above MaxSendRate and throttling damages sender reputation, so
 * the cap matters more than the burst. Capacity is deliberately NOT allowed to
 * accumulate over an idle period: a drainer idle for a minute must not then
 * fire a minute's worth of sends in one batch.
 */
export function createRateLimiter(perSecond: number, now: () => number = Date.now): RateLimiter {
  let tokens = perSecond;
  let last = now();

  const refill = () => {
    const t = now();
    tokens = Math.min(perSecond, tokens + ((t - last) / 1000) * perSecond);
    last = t;
  };

  const tryTake = (): boolean => {
    refill();
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };

  return {
    tryTake,
    async take() {
      while (!tryTake()) {
        await new Promise((r) => setTimeout(r, Math.ceil(1000 / perSecond)));
      }
    },
  };
}

export interface DrainDeps {
  db: Db;
  tables: NotificationTables;
  handlers: Record<Channel, ChannelHandler | undefined>;
  rateLimiter?: RateLimiter;
}

/**
 * Atomically claim up to `limit` due rows (status=pending, backoff elapsed),
 * flipping them to 'processing'. FOR UPDATE SKIP LOCKED lets concurrent
 * drainers run without grabbing the same rows.
 *
 * Transactional rows are claimed first: a large campaign must never delay an
 * order receipt queued a moment later.
 */
async function claim(
  db: Db,
  tables: NotificationTables,
  limit: number,
  now: number,
): Promise<OutboxRow[]> {
  const o = tables.notificationOutbox;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(o)
      .where(and(eq(o.status, "pending"), lte(o.nextAttemptAt, now)))
      .orderBy(sql`${o.kind} = 'transactional' desc`, asc(o.nextAttemptAt))
      .limit(limit)
      .for("update", { skipLocked: true });
    if (rows.length === 0) return [];
    await tx
      .update(o)
      .set({ status: "processing" })
      .where(inArray(o.id, rows.map((r) => r.id)));
    return rows;
  });
}

async function process(
  db: Db,
  tables: NotificationTables,
  row: OutboxRow,
  handler: ChannelHandler | undefined,
): Promise<void> {
  const o = tables.notificationOutbox;
  const attempts = row.attempts + 1;
  try {
    if (!handler) throw new Error(`No handler for channel ${row.channel}`);
    const result = await handler(row);
    // null = skipped (no DB template for this event/channel). Terminal, no retry.
    await db
      .update(o)
      .set(
        result
          ? { status: "sent", attempts, providerMessageId: result.providerMessageId, lastError: null }
          : { status: "sent", attempts, providerMessageId: null, lastError: "skipped: no template" },
      )
      .where(eq(o.id, row.id));
  } catch (err) {
    const lastError = err instanceof Error ? err.message : String(err);
    const dead = attempts >= MAX_ATTEMPTS;
    await db
      .update(o)
      .set({
        status: dead ? "failed" : "pending",
        attempts,
        lastError,
        nextAttemptAt: Date.now() + nextBackoffMs(attempts),
      })
      .where(eq(o.id, row.id));
  }
}

/** Claim + deliver one batch. Returns how many rows were processed. */
export async function drainOnce(deps: DrainDeps, limit = 25): Promise<number> {
  const rows = await claim(deps.db, deps.tables, limit, Date.now());
  for (const row of rows) {
    // Serialized on purpose: the rate limiter exists to hold a send ceiling,
    // which Promise.all over the batch would blow straight through.
    if (deps.rateLimiter && row.channel !== "in_app") await deps.rateLimiter.take();
    await process(deps.db, deps.tables, row, deps.handlers[row.channel as Channel]);
  }
  return rows.length;
}

/** Drain until the queue is empty or `maxBatches` is hit. */
export async function drainPending(deps: DrainDeps, limit = 25, maxBatches = 20): Promise<number> {
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await drainOnce(deps, limit);
    total += n;
    if (n < limit) break;
  }
  return total;
}
