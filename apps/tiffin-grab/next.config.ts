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
  // Turbopack reports "Unknown module type" (seen on deploy-tiffin-grab).
  transpilePackages: ["@foundry/commons", "@foundry/database", "@foundry/routes", "@foundry/themes", "@foundry/ui", "@foundry/design-system", "@foundry/crm", "@foundry/realtime", "@foundry/email", "@foundry/auth", "@foundry/auth-ui", "@foundry/clover", "@foundry/payments", "@foundry/google-reviews", "@foundry/places", "@foundry/storage", "@foundry/wallet", "@foundry/friends", "@foundry/discounts", "@foundry/delivery", "@foundry/address", "@foundry/coupons", "@relay/engine", "@relay/email"],
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
    // Static imports (/_next/static/media/**) are auto-allowed by Next.
  },
  async redirects() {
    const slugs = ["profile", "security", "address", "dietary", "notifications", "contact"];
    return [
      ...slugs.map((s) => ({ source: `/me/${s}`, destination: `/me/account?section=${s}`, permanent: true })),
      // Delivery notes moved onto each saved address.
      { source: "/me/delivery-notes", destination: "/me/account?section=address", permanent: true },
      { source: "/me/usage", destination: "/me/wallet", permanent: true },
      // The old WordPress site's legal URLs, still linked from emails and search results.
      { source: "/terms-and-conditions", destination: "/terms", permanent: true },
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
    ];
  },
  // Caddy compresses (encode zstd gzip) and skips already-encoded bodies, so Next
  // gzipping on the single Node event loop was pure CPU cost.
  compress: false,
  experimental: {
    // Barrel packages: without this, one named import from @relay/engine/ui pulled
    // the whole email editor (react-email + TipTap + Tailwind compiler, ~2 MB) into
    // every dashboard page via the notification bell.
    optimizePackageImports: [
      "radix-ui",
      "cmdk",
      "@relay/engine",
      "@foundry/commons",
      "@foundry/design-system",
      "@foundry/crm",
      "@foundry/auth-ui",
      "@foundry/ui",
    ],
    // Reuse a visited dynamic page for 30s on back/forward and repeat clicks
    // instead of a fresh server round trip. Server actions still invalidate it.
    staleTimes: { dynamic: 30 },
    // Uploads go through server actions (payment proof, support photos: up to 4 x 5 MB).
    // Next caps action bodies at 1 MB by default, and proxy.ts buffers bodies only up to
    // 10 MB, so anything bigger was rejected or truncated.
    serverActions: { bodySizeLimit: "25mb" },
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
