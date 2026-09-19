import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.join(import.meta.dirname, "..", "..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: [
    "@foundry/commons",
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
    "@relay/email",
  ],
  turbopack: { root: monorepoRoot },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
  experimental: { optimizePackageImports: ["radix-ui"] },
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
