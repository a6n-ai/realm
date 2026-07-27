import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  // Docker: emit .next/standalone (self-contained server.js + traced node_modules).
  // outputFileTracingRoot must be the monorepo root or workspace deps get missed.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@realm/commons", "@realm/database", "@realm/routes", "@realm/themes", "@realm/ui", "@realm/design-system", "@realm/crm", "@realm/realtime", "@realm/auth-ui", "@realm/clover"],
  turbopack: { root: monorepoRoot },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  experimental: { optimizePackageImports: ["radix-ui", "cmdk"] },
  // /menu and /productsmenu were both live public URLs before the rename to
  // /eats — keep indexed/bookmarked links alive.
  async redirects() {
    return [
      { source: "/menu", destination: "/eats", permanent: true },
      { source: "/productsmenu", destination: "/eats", permanent: true },
    ];
  },
};

export default nextConfig;
