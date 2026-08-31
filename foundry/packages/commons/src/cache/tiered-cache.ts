import type { CacheEntry, CacheTier } from "./types";

export interface TieredCacheOptions {
  /** Namespace — prefixed onto every key, so one tier backend serves many caches. */
  name: string;
  /** Tiers ordered near→far: [LruTier] today, [LruTier, RedisTier] once Redis lands. */
  tiers: CacheTier[];
  /** Default ttl (ms) applied on writes when a per-call ttl isn't given. */
  defaultTtlMs?: number;
  /** When true, a supplier returning null/undefined is cached too (negative caching). */
  negativeCache?: boolean;
}

/**
 * Read-through cache over an ordered list of tiers — the TS analog of the
 * reference Caffeine+Redis `CacheService`.
 *
 * - `get` walks tiers near→far and backfills nearer tiers on a far hit.
 * - `getOrSet` is the read-through primitive (= `cacheValueOrGet`) with
 *   single-flight stampede protection: concurrent misses for the same key share
 *   one supplier call.
 * - `evict`/`evictAll` drop from every tier. (A Redis tier will additionally
 *   broadcast eviction via pub/sub so sibling instances' L1 stays coherent —
 *   that lives in the tier, not here.)
 */
export class TieredCache {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly opts: TieredCacheOptions) {}

  private fullKey(key: string): string {
    return `${this.opts.name}:${key}`;
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    const fk = this.fullKey(key);
    const { tiers } = this.opts;
    for (let i = 0; i < tiers.length; i++) {
      const hit = await tiers[i].get<T>(fk);
      if (hit !== undefined) {
        // Backfill the nearer tiers that missed.
        for (let j = 0; j < i; j++) await tiers[j].set(fk, hit.value, this.opts.defaultTtlMs);
        return hit;
      }
    }
    return undefined;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const fk = this.fullKey(key);
    const ttl = ttlMs ?? this.opts.defaultTtlMs;
    await Promise.all(this.opts.tiers.map((t) => t.set(fk, value, ttl)));
  }

  async evict(key: string): Promise<void> {
    const fk = this.fullKey(key);
    await Promise.all(this.opts.tiers.map((t) => t.del(fk)));
  }

  async evictAll(): Promise<void> {
    await Promise.all(this.opts.tiers.map((t) => t.clear()));
  }

  /**
   * Return the cached value for `key`, or compute it via `supplier`, store it
   * across all tiers, and return it. Concurrent callers for the same key await
   * one supplier invocation (single-flight) to avoid a cache stampede.
   */
  async getOrSet<T>(key: string, supplier: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== undefined) return hit.value;

    const fk = this.fullKey(key);
    const existing = this.inflight.get(fk);
    if (existing) return existing as Promise<T>;

    const p = (async () => {
      try {
        const value = await supplier();
        if (value != null || this.opts.negativeCache) await this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inflight.delete(fk);
      }
    })();
    this.inflight.set(fk, p);
    return p;
  }
}
