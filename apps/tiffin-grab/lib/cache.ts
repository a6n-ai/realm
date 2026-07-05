import { LruTier, RedisTier, TieredCache } from "@realm/commons";
import { getRedis } from "./redis";

/**
 * A read-through cache tiered L1 in-process LRU → L2 shared Redis. The Redis
 * connection lives in the app (server-only, not in commons), so the tier is
 * wired here and injected. `name` namespaces keys and scopes `evictAll()`'s
 * Redis SCAN to just this cache.
 */
export function sharedCache(name: string, defaultTtlMs = 60_000): TieredCache {
  return new TieredCache({
    name,
    tiers: [new LruTier(), new RedisTier(getRedis(), name)],
    defaultTtlMs,
  });
}
