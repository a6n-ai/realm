import { defineConfig } from "vitest/config";
import path from "node:path";

// puchkaman had a `test` script but no config, so `@/…` imports could not
// resolve and its existing tests never ran under `pnpm turbo test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "db/**/*.test.ts", "app/**/*.test.ts"],
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
