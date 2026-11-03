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
export function sharedCache(name: string, defaultTtlMs = 60_000, kvRetainMs = 0, workersL1CapMs?: number): TieredCache {
  const l1 = isWorkers() && workersL1CapMs ? new CappedLruTier(workersL1CapMs) : new LruTier();
  return new TieredCache({ name, tiers: [l1, ...sharedTier(name, kvRetainMs)], defaultTtlMs });
}

// Another isolate's L1 cannot be evicted, so a cache that public pages regenerate from must not hold
// a copy longer than the cap, or a revalidation re-caches the stale value.
class CappedLruTier extends LruTier {
  constructor(private readonly capMs: number) {
    super();
  }
  override set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    return super.set(key, value, Math.min(ttlMs || this.capMs, this.capMs));
  }
}

function sharedTier(name: string, kvRetainMs: number) {
  if (isWorkers()) return [new KvTier(name, undefined, kvRetainMs)];
  // `next build` for the Worker artifact runs on Node with no Redis (CI); LRU is enough to collect page data.
  if (process.env.BUILD_TARGET === "workers") return [];
  return [new RedisTier(getRedis(), name)];
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
