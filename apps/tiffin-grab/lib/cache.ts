import { LruTier, RedisTier, TieredCache } from "@foundry/commons";
import { KvTier } from "./cache/kv-tier";
import { getRedis } from "./redis";
import { isWorkers } from "./runtime/platform";

/**
 * A read-through cache tiered L1 in-process LRU → L2 shared store: Redis on
 * Node, Workers KV on Workers. The connection lives in the app (server-only,
 * not in commons), so the tier is wired here and injected. `name` namespaces
 * keys and scopes `evictAll()` to just this cache.
 */
export function sharedCache(name: string, defaultTtlMs = 60_000): TieredCache {
  return new TieredCache({
    name,
    tiers: [new LruTier(), isWorkers() ? new KvTier(name) : new RedisTier(getRedis(), name)],
    defaultTtlMs,
  });
}

/**
 * For admin-edited config that must reflect a write immediately. KV is
 * eventually consistent (~60s) and cannot be evicted across locations, so on
 * Workers this is per-isolate LRU only with a short TTL: Postgres is read at
 * most every 5s per isolate. Node keeps the Redis tier unchanged.
 */
// defaultTtlMs is intentionally ignored on Workers (5s LRU only).
export function configCache(name: string, defaultTtlMs = 60_000): TieredCache {
  return isWorkers()
    ? new TieredCache({ name, tiers: [new LruTier()], defaultTtlMs: 5_000 })
    : sharedCache(name, defaultTtlMs);
}
