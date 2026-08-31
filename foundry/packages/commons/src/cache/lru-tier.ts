import { LRUCache } from "lru-cache";
import type { CacheEntry, CacheTier } from "./types";

export interface LruTierOptions {
  /** Max entries before LRU eviction. Default 500. */
  max?: number;
  /** Default entry TTL in ms (0 = no expiry). Per-set ttl overrides this. */
  ttlMs?: number;
}

/**
 * In-process L1 tier — the Caffeine analog. Per-instance, fast, lost on cold
 * start. Pair with a Redis tier for a shared L2 that survives across instances.
 */
export class LruTier implements CacheTier {
  private readonly store: LRUCache<string, CacheEntry<unknown>>;

  constructor(opts: LruTierOptions = {}) {
    this.store = new LRUCache<string, CacheEntry<unknown>>({
      max: opts.max ?? 500,
      ttl: opts.ttlMs ?? 0,
      // We cache value wrappers, including {value:null}; never drop a hit just
      // because the wrapped value is falsy.
      allowStale: false,
    });
  }

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    return this.store.get(key) as CacheEntry<T> | undefined;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    this.store.set(key, { value }, ttlMs ? { ttl: ttlMs } : undefined);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}
