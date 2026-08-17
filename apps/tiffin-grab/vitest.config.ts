import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
    // pnpm installs two physical `next` copies (differing peer sets), so the app
    // and @realm/* packages import different `next/navigation` modules — a
    // `vi.mock("next/navigation")` would only patch one. Dedupe to a single copy.
    dedupe: ["next"],
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // Pre-run wallet-FK cleanup (setup) + post-run reseed of the LOCAL dev DB
    // only (teardown) — guarded by isLocalDb() so it never seeds prod on main/CI.
    globalSetup: ["./vitest.teardown.ts"],
    // Playwright lives under e2e/*.spec.ts — only Vitest files there are e2e/__tests__.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "e2e/**/*.spec.ts",
      "e2e/auth.setup*.ts",
      "skeleton-audit/**",
      // Manual QA seeding scripts that borrow the vitest runner — they CREATE
      // live rows for a fixture account rather than asserting anything, so
      // running them with the suite mutates the dev DB and they fail whenever
      // another file's cleanup removes their fixture user. Run them on demand:
      //   pnpm --filter tiffin-grab exec vitest run --exclude '**/node_modules/**' db/seed-qa-customer.test.ts
      "db/seed-qa-*.test.ts",
    ],
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
