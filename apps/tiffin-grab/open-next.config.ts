import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import queueCache from "@opennextjs/cloudflare/overrides/queue/queue-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// ISR for public pages: R2 holds rendered entries (behind a regional cache), D1 holds tag
// invalidations, and a Durable Object queue dedupes background revalidations.
// Image optimization needs no override here: it uses the IMAGES binding in wrangler.jsonc.
export default {
  ...defineCloudflareConfig({
    incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
    tagCache: d1NextTagCache,
    queue: queueCache(doQueue),
    enableCacheInterception: true,
  }),
  // Same as OpenNext's default `pnpm build`, plus the yoga wasm patch the PDF routes need on workerd
  // and the duplicate Turbopack chunk fold (why: cloudflare/dedupe-chunks.mjs).
  buildCommand: "pnpm build && node cloudflare/patch-pdf.mjs && node cloudflare/dedupe-chunks.mjs",
};
