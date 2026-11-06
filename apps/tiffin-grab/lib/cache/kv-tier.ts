import type { CacheEntry, CacheTier } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";

const logger = createLogger("cache:kv-tier");

/** The slice of a Workers KV namespace this tier uses (structural: no workers-types dependency). */
export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

// Bigints are tagged on the way in so L2 round-trips exactly what L1 holds.
const BIGINT_TAG = "$bigint";
const replacer = (_k: string, v: unknown) => (typeof v === "bigint" ? { [BIGINT_TAG]: v.toString() } : v);
const reviver = (_k: string, v: unknown) => {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const tag = (v as Record<string, unknown>)[BIGINT_TAG];
    if (Object.keys(v).length === 1 && typeof tag === "string" && /^-?\d+$/.test(tag)) return BigInt(tag);
  }
  return v;
};

// The binding is read per call: Workers bind env per request, so it must never be held across requests.
async function cacheBinding(): Promise<KvLike> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  return (getCloudflareContext().env as unknown as { CACHE: KvLike }).CACHE;
}

/**
 * L2 tier on Workers KV. Keys arrive already prefixed `${prefix}:` by TieredCache.
 * KV is eventually consistent (up to ~60s across locations) and rejects TTLs under 60s.
 * Failures degrade to a miss, never an error.
 */
export class KvTier implements CacheTier {
  constructor(
    private readonly prefix: string,
    private readonly binding: () => KvLike | Promise<KvLike> = cacheBinding,
    // Keep entries in KV at least this long, whatever ttl the cache passes. The cache's ttl then only
    // bounds the per-isolate L1, so a cold isolate reads KV instead of rebuilding the value.
    private readonly retainMs = 0,
  ) {}

  async get<T>(key: string): Promise<CacheEntry<T> | undefined> {
    try {
      const raw = await (await this.binding()).get(key);
      return raw == null ? undefined : (JSON.parse(raw, reviver) as CacheEntry<T>);
    } catch (err) {
      logger.warn({ err, key }, "KvTier.get failed, treating as miss");
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    try {
      const ttl = Math.max(ttlMs ?? 0, this.retainMs);
      const expirationTtl = ttl > 0 ? Math.max(60, Math.ceil(ttl / 1000)) : undefined;
      await (await this.binding()).put(key, JSON.stringify({ value }, replacer), expirationTtl ? { expirationTtl } : undefined);
    } catch (err) {
      logger.warn({ err, key }, "KvTier.set failed, skipping L2 write");
    }
  }

  async del(key: string): Promise<void> {
    try {
      await (await this.binding()).delete(key);
    } catch (err) {
      logger.warn({ err, key }, "KvTier.del failed");
    }
  }

  async clear(): Promise<void> {
    try {
      const kv = await this.binding();
      const prefix = `${this.prefix}:`;
      let cursor: string | undefined;
      do {
        const page = await kv.list({ prefix, cursor });
        await Promise.all(page.keys.map((k) => kv.delete(k.name)));
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
    } catch (err) {
      logger.warn({ err, prefix: this.prefix }, "KvTier.clear failed");
    }
  }
}
