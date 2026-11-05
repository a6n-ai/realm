import base from "./open-next.config";

// Measurement-only: same OpenNext pipeline as open-next.config.ts, with Webpack
// instead of the Next 16 Turbopack default. Not the production config.
const config = {
  ...base,
  buildCommand: "pnpm exec next build --webpack && node cloudflare/patch-pdf.mjs",
};

export default config;
