import { defineConfig } from "vitest/config";
import path from "node:path";

// puchkaman had a `test` script but no config, so `@/…` imports could not
// resolve and its existing tests never ran under `pnpm turbo test`.
export default defineConfig({
  test: {
    environment: "node",
    // __tests__/ covers root-level modules like proxy.ts that live outside
    // lib/, db/ and app/ — without it those test files are silently skipped.
    include: [
      "lib/**/*.test.ts",
      "db/**/*.test.ts",
      "app/**/*.test.ts",
      "workers/**/*.test.ts",
      "components/**/*.test.ts",
      "components/**/*.test.tsx",
      "__tests__/**/*.test.ts",
    ],
    // db/client.ts throws at import time without this. Unit tests here stub the
    // repository and never open a connection; the value only has to parse.
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://localhost:5432/puchkaman",
      // Signs friend invite refs in the friends integration test.
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "puchkaman-test-secret-puchkaman-test-secret",
    },
    // Integration suites share one Postgres and clean up their own rows; in parallel one
    // file's cleanup deletes users another file is mid-way through notifying.
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
