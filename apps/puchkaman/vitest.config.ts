import { defineConfig } from "vitest/config";
import path from "node:path";

// puchkaman had a `test` script but no config, so `@/…` imports could not
// resolve and its existing tests never ran under `pnpm turbo test`.
export default defineConfig({
  test: {
    environment: "node",
    // __tests__/ covers root-level modules like proxy.ts that live outside
    // lib/, db/ and app/ — without it those test files are silently skipped.
    include: ["lib/**/*.test.ts", "db/**/*.test.ts", "app/**/*.test.ts", "__tests__/**/*.test.ts"],
    // db/client.ts throws at import time without this. Unit tests here stub the
    // repository and never open a connection; the value only has to parse.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://localhost:5432/puchkaman",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
