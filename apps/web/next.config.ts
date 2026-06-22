import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tiffin/commons", "@tiffin/commons-drizzle", "@tiffin/commons-next"],
  turbopack: { root: path.join(import.meta.dirname, "..", "..") },
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok.app", "*.ngrok.io"],
};

export default nextConfig;
