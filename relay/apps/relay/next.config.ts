import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..", "..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: [
    "@foundry/commons",
    "@foundry/database",
    "@foundry/themes",
    "@foundry/ui",
    "@foundry/design-system",
    "@foundry/crm",
    "@foundry/auth",
    "@foundry/email",
    "@relay/engine",
    "@relay/email",
    "@relay/ui",
    "@relay/sdk",
  ],
  turbopack: { root: monorepoRoot },
};

export default nextConfig;
