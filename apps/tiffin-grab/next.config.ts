import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  // Docker: emit .next/standalone (self-contained server.js + traced node_modules).
  // outputFileTracingRoot must be the monorepo root or workspace deps get missed.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  // Git-hosted @foundry/* ship raw .ts. Workspace links used to be compiled as
  // monorepo source; tarballs under node_modules need transpilePackages or
  // Turbopack reports "Unknown module type".
  transpilePackages: ["@foundry/commons", "@foundry/database", "@foundry/routes", "@foundry/themes", "@foundry/ui", "@foundry/design-system", "@foundry/crm", "@foundry/realtime", "@foundry/auth", "@foundry/auth-ui", "@foundry/clover", "@foundry/payments", "@foundry/google-reviews", "@foundry/places", "@foundry/storage", "@foundry/wallet", "@relay/engine"],
  turbopack: { root: monorepoRoot },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  images: {
    // Default is 14400 (4h), which would re-optimize the same dish photo ~6x/day on a
    // t3.small. Blobs are immutable — a changed photo is a new key, not a new body.
    minimumCacheTTL: 31536000,
    // localPatterns is an ALLOWLIST: any local src outside it 400s. That is deliberate.
    // `search: ""` forbids a query string, which fences next/image to STATIC dish photos:
    // secured files are served as /api/files/<path>?ak=<token> with a per-request token,
    // so there is no fixed value to allow-list and they must stay on plain <img>.
    // Optimizing them would cache one user's token-bearing response under a shared key.
    localPatterns: [{ pathname: "/api/files/**", search: "" }],
    // If FILES_PUBLIC_BASE_URL (see packages/storage's FileSystemService) ever points at a
    // CDN domain, file-storage thumbnail URLs become https://<cdn-domain>/... — outside both
    // lists above. Any next/image usage on file-storage-served images must add that host to
    // remotePatterns (or stay on plain <img>) before that env var is set in prod.
    // Marketing hero background: a single static CC BY-SA Commons photo, not user content.
    remotePatterns: [{ protocol: "https", hostname: "commons.wikimedia.org", pathname: "/wiki/Special:FilePath/**" }],
  },
  experimental: { optimizePackageImports: ["radix-ui", "cmdk"] },
};

export default nextConfig;
