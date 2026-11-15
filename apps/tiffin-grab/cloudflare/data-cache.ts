import { getCloudflareContext } from "@opennextjs/cloudflare";
import { computeCacheKey } from "@opennextjs/cloudflare/overrides/internal";
import r2IncrementalCache, { PREFIX_ENV_NAME } from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { D1NextModeTagCache } from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// OpenNext keys every cache entry by build id, so each deploy starts empty. Pages ("cache") and
// "use cache" ("composable") entries must: they reference build-hashed chunks and action ids.
// fetch() data does not, and losing it on ~20 deploys a day re-billed Google Places (Nov 2026).
export const DATA_BUILD_ID = "data";

export function buildIdFor(cacheType: string | undefined, buildId: string | undefined): string | undefined {
  return cacheType === "fetch" ? DATA_BUILD_ID : buildId;
}

type R2Cache = typeof r2IncrementalCache;

/** R2 incremental cache whose fetch entries survive deploys; get/set/delete are OpenNext's own. */
export const r2CacheKeepingData: R2Cache = Object.assign(Object.create(r2IncrementalCache) as R2Cache, {
  getR2Key(key: string, cacheType?: string): string {
    const env = getCloudflareContext().env as unknown as Record<string, string | undefined>;
    return computeCacheKey(key, {
      prefix: env[PREFIX_ENV_NAME],
      buildId: buildIdFor(cacheType, process.env.OPEN_NEXT_BUILD_ID),
      cacheType: cacheType as Parameters<typeof computeCacheKey>[1]["cacheType"],
    });
  },
});

/**
 * Revalidation times outlive builds too; otherwise a fetch entry kept across a deploy would miss a
 * tag revalidated before it. Safe for pages: a new build only holds entries written after it.
 */
class BuildlessTagCache extends D1NextModeTagCache {
  protected override getBuildId(): string {
    return "tags";
  }
}

export const d1TagCacheKeepingData = new BuildlessTagCache();
