import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  // Docker: emit .next/standalone (self-contained server.js + traced node_modules).
  // outputFileTracingRoot must be the monorepo root or workspace deps get missed.
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@realm/commons", "@realm/commons-drizzle", "@realm/commons-next", "@realm/themes", "@realm/ui", "@realm/design-system", "@realm/crm-core"],
  turbopack: { root: monorepoRoot },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  experimental: { optimizePackageImports: ["radix-ui", "cmdk"] },
};

export default nextConfig;
