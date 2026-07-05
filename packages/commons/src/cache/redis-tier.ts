import { createLogger } from "../logger";
import type { CacheEntry, CacheTier } from "./types";

const logger = createLogger("cache:redis-tier");

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
      return raw == null ? undefined : (JSON.parse(raw) as CacheEntry<T>);
    } catch (err) {
      logger.warn({ err, key }, "RedisTier.get failed, treating as miss");
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const payload = JSON.stringify({ value });
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
