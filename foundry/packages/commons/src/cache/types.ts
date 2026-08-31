/**
 * A single storage tier. Tiers are ordered near→far (e.g. in-process LRU, then
 * Redis). All ops are async so a network tier (Redis) and an in-memory tier
 * (LRU) share one interface — the LRU tier just resolves immediately.
 *
 * `get` returns `undefined` on a MISS and a wrapped `CacheEntry` on a HIT. The
 * wrapper is what lets a cached `null`/`undefined` (negative cache) be a hit
 * rather than indistinguishable from a miss — mirroring the reference
 * CacheService's `CacheObject(null)`.
 */
export interface CacheEntry<T> {
  value: T;
}

export interface CacheTier {
  get<T>(key: string): Promise<CacheEntry<T> | undefined>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}
