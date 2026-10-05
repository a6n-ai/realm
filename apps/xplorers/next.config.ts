import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: [
    "@foundry/commons",
    "@foundry/coupons",
    "@foundry/database",
    "@foundry/routes",
    "@foundry/themes",
    "@foundry/ui",
    "@foundry/design-system",
    "@foundry/realtime",
    "@foundry/crm",
    "@foundry/auth",
    "@foundry/auth-ui",
    "@foundry/email",
    "@foundry/storage",
    "@foundry/payments",
    "@relay/email",
  ],
  turbopack: { root: monorepoRoot },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  // Caddy compresses (encode zstd gzip) and skips already-encoded bodies, so Next
  // gzipping on the single Node event loop was pure CPU cost.
  compress: false,
  experimental: {
    // Barrel packages: tree-shake their re-exports instead of pulling whole
    // packages into every page that imports one symbol.
    optimizePackageImports: [
      "radix-ui",
      "@foundry/commons",
      "@foundry/design-system",
      "@foundry/crm",
      "@foundry/auth-ui",
      "@foundry/ui",
    ],
    // Reuse a visited dynamic page for 30s on back/forward and repeat clicks
    // instead of a fresh server round trip. Server actions still invalidate it.
    staleTimes: { dynamic: 30 },
  },
  async redirects() {
    return [
      { source: "/about", destination: "/the-place", permanent: true },
      { source: "/programs", destination: "/whats-on", permanent: true },
      { source: "/classes", destination: "/kids", permanent: true },
      { source: "/events", destination: "/whats-on", permanent: true },
      { source: "/parties", destination: "/birthdays", permanent: true },
    ];
  },
};

export default nextConfig;
