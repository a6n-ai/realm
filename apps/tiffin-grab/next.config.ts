import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  // Docker: emit .next/standalone (self-contained server.js + traced node_modules).
  // outputFileTracingRoot must be the monorepo root or workspace deps get missed.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@realm/commons", "@realm/database", "@realm/routes", "@realm/themes", "@realm/ui", "@realm/design-system", "@realm/crm", "@realm/realtime"],
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
  },
  experimental: { optimizePackageImports: ["radix-ui", "cmdk"] },
};

export default nextConfig;
