import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental/tag cache: every page is dynamic (no ISR, unstable_cache or "use cache").
// Image optimization needs no override here: it uses the IMAGES binding in wrangler.jsonc.
export default {
  ...defineCloudflareConfig(),
  // Same as OpenNext's default `pnpm build`, plus the yoga wasm patch the PDF routes need on workerd.
  buildCommand: "BUILD_TARGET=workers pnpm build && node cloudflare/patch-pdf.mjs",
};
