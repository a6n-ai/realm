import { createLogger } from "../logger";
import type { CacheEntry, CacheTier } from "./types";

const logger = createLogger("cache:redis-tier");

// JSON has no bigint, but cached values (e.g. the catalog snapshot's `bigint`
// row ids) do — a plain JSON.stringify throws and the L2 write is silently lost.
// Tag bigints on write and revive them on read so L2 round-trips exactly what L1
// holds. ponytail: a real object literally shaped `{ $bigint: "<digits>" }` would
// be mis-revived; distinctive tag + digit check makes that collision negligible.
const BIGINT_TAG = "$bigint";
function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? { [BIGINT_TAG]: value.toString() } : value;
}
function bigintReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value);
    const tag = (value as Record<string, unknown>)[BIGINT_TAG];
    if (keys.length === 1 && typeof tag === "string" && /^-?\d+$/.test(tag)) return BigInt(tag);
  }
  return value;
}

/**
 * Minimal shape of the Redis client this tier needs. Structural on purpose —
 * commons is the acyclic floor and must not import `ioredis`; the app injects
 * its shared connection (see `lib/redis.ts`). `ioredis`'s Redis satisfies this.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  scan(cursor: string | number, ...args: unknown[]): Promise<[string, string[]]>;
}

/**
 * Shared L2 tier backed by Redis — the far tier that survives cold starts and
 * is shared across instances. Values are stored as `JSON.stringify({ value })`
 * so a cached `null`/`undefined` (negative cache) round-trips as a HIT while a
 * true MISS returns `undefined` (Redis GET → null).
 *
 * L2 failures never propagate: a Redis outage degrades to the nearer LRU tier
 * (and ultimately the supplier), it does not fail the request.
 */
export class RedisTier implements CacheTier {
  /** @param prefix the cache namespace (== TieredCache `name`), so `clear()` can SCAN just this cache's keys. */
  constructor(
    private readonly client: RedisLike,
    private readonly prefix: string,
  ) {}

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const raw = await this.client.get(key);
      return raw == null ? undefined : (JSON.parse(raw, bigintReviver) as CacheEntry<T>);
    } catch (err) {
      logger.warn({ err, key }, "RedisTier.get failed, treating as miss");
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const payload = JSON.stringify({ value }, bigintReplacer);
      if (ttlMs && ttlMs > 0) await this.client.set(key, payload, "PX", ttlMs);
      else await this.client.set(key, payload);
    } catch (err) {
      logger.warn({ err, key }, "RedisTier.set failed, skipping L2 write");
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (err) {
      logger.warn({ err, key }, "RedisTier.del failed");
    }
  }

  async clear(): Promise<void> {
    // Keys are `${prefix}:${key}` (TieredCache prefixes before calling the tier),
    // so SCAN + DEL only this namespace — never FLUSHDB the shared instance.
    try {
      const match = `${this.prefix}:*`;
      let cursor = "0";
      do {
        const [next, keys] = await this.client.scan(cursor, "MATCH", match, "COUNT", 200);
        cursor = next;
        if (keys.length) await this.client.del(...keys);
      } while (cursor !== "0");
    } catch (err) {
      logger.warn({ err, prefix: this.prefix }, "RedisTier.clear failed");
    }
  }
}
