import { createAppCaches } from "@foundry/commons";

/**
 * This app's caches, over @foundry/commons createAppCaches: `sharedCache` (in-process LRU, then
 * the CACHE KV namespace on Workers) and `configCache` (admin-edited config: 5 s per-isolate LRU
 * on Workers, evict on every write). See createAppCaches for when to use which.
 */
export const { sharedCache, configCache } = createAppCaches({
  kv: async () => (await import("@/lib/runtime/cf-env")).cfEnv().CACHE,
});
