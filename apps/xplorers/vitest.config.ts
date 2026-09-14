import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "db/**/*.test.ts", "__tests__/**/*.test.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://localhost:5432/xplorers",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "xplorers-test-secret-xplorers-test-secret",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3002",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
