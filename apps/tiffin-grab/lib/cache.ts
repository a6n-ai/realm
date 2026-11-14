import { LruTier, TieredCache } from "@foundry/commons";
import { KvTier } from "./cache/kv-tier";
import { isWorkers } from "@foundry/commons/runtime/platform";

/**
 * A read-through cache tiered L1 in-process LRU → L2 Workers KV (Workers only; Node
 * dev/tests/build are LRU-only). The tier is wired here and injected. `name` namespaces
 * keys and scopes `evictAll()` to just this cache.
 */
export function sharedCache(name: string, defaultTtlMs = 60_000, kvRetainMs = 0, capWorkersL1 = false): TieredCache {
  const l1 = isWorkers() && capWorkersL1 ? new CappedLruTier(WORKERS_L1_CAP_MS) : new LruTier();
  return new TieredCache({ name, tiers: [l1, ...sharedTier(name, kvRetainMs)], defaultTtlMs });
}

const WORKERS_L1_CAP_MS = 60_000;
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
  return isWorkers() ? [new KvTier(name, undefined, kvRetainMs)] : [];
}

/**
 * For admin-edited config that must reflect a write immediately. KV is
 * eventually consistent (~60s) and cannot be evicted across locations, so on
 * Workers this is per-isolate LRU only with a short TTL: Postgres is read at
 * most every 5s per isolate.
 */
// defaultTtlMs is intentionally ignored on Workers (5s LRU only).
export function configCache(name: string, defaultTtlMs = 60_000): TieredCache {
  return isWorkers()
    ? new TieredCache({ name, tiers: [new LruTier()], defaultTtlMs: 5_000 })
    : sharedCache(name, defaultTtlMs);
}
