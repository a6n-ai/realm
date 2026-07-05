import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Pre-run wallet-FK cleanup (setup) + post-run reseed of the LOCAL dev DB
    // only (teardown) — guarded by isLocalDb() so it never seeds prod on main/CI.
    globalSetup: ["./vitest.teardown.ts"],
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin",
      // Dedicated Redis DB (index 15) for tests — vitest.setup flushes it between
      // tests so a prior suite's cached snapshot can't bleed into the next.
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379/15",
    },
    // Integration tests share one Postgres table; run files serially so their
    // truncate-in-beforeEach does not race across parallel workers.
    fileParallelism: false,
  },
});
