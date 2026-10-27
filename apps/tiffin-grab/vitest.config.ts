import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "skeleton-audit", ".turbo"]);
// db/seed-qa-* are manual QA seeders that create live rows (run on demand); e2e specs are Playwright.
const SKIP_FILE = /^db\/seed-qa-|^e2e\/.*\.spec\.ts$|^e2e\/auth\.setup/;
// A file that reaches Postgres or Redis (directly, or through a service) runs in the serial `db` project.
// ponytail: an import scan, not a module graph; a pure test that only reaches the DB through a component
// lands in `unit` and fails loudly there. Add a `// @vitest-db` line to such a file to move it.
const TOUCHES_DB = /@vitest-db|@\/db\b|db\/client|db\/schema|test-helpers|lib\/redis|getRedis|ioredis|\.service"|lib\/services\/|from "(\.\.\/)+db|from "(\.\.?\/)+client"/;
// Files that swap modules or globals need their own module copy; the rest share one per worker.
const SWAPS_MODULES = /vi\.(mock|unmock|doMock|doUnmock|stubGlobal|stubEnv)\(/;

function testFiles(dir = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) || e.name.startsWith(".") ? [] : testFiles(join(dir, e.name));
    const rel = relative(ROOT, join(dir, e.name));
    return /\.test\.tsx?$/.test(e.name) && !SKIP_FILE.test(rel) ? [rel] : [];
  });
}
const files = testFiles().map((f) => ({ f, src: readFileSync(join(ROOT, f), "utf8") }));
const dbFiles = files.filter((x) => TOUCHES_DB.test(x.src)).map((x) => x.f);
const pure = files.filter((x) => !TOUCHES_DB.test(x.src));
const mockedFiles = pure.filter((x) => SWAPS_MODULES.test(x.src)).map((x) => x.f);
const sharedFiles = pure.filter((x) => !SWAPS_MODULES.test(x.src)).map((x) => x.f);

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // The real package throws outside a Next server build; orders.service now reaches lib/payments/stripe.
      "server-only": fileURLToPath(new URL("./vitest.server-only-stub.ts", import.meta.url)),
    },
    // pnpm installs two physical `next` copies (differing peer sets), so the app
    // and @foundry/* packages import different `next/navigation` modules — a
    // `vi.mock("next/navigation")` would only patch one. Dedupe to a single copy.
    dedupe: ["next", "@foundry/commons"],
  },
  test: {
    environment: "node",
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin_v2",
      // Dedicated Redis DB (index 15) for tests — vitest.setup flushes it between
      // tests so a prior suite's cached snapshot can't bleed into the next.
      REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379/15",
      // Always set in deployed envs. Without it better-auth has no baseURL for a
      // server-side auth.api call (no request to infer one from), and magic-link
      // issuance throws on `new URL("")`.
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    },
    // Three projects: pure tests run in parallel (shared module copy when they swap nothing), live-DB tests
    // serially. `vitest run --project unit --project unit-mocked` needs no Postgres or Redis (CI runs that).
    projects: [
      { extends: true, test: { name: "unit", include: sharedFiles, setupFiles: ["./vitest.setup.base.ts"], isolate: false } },
      { extends: true, test: { name: "unit-mocked", include: mockedFiles, setupFiles: ["./vitest.setup.base.ts"] } },
      {
        extends: true,
        test: {
          name: "db",
          include: dbFiles,
          setupFiles: ["./vitest.setup.base.ts", "./vitest.setup.ts"],
          // Pre-run wallet-FK cleanup (setup) + post-run reseed of the LOCAL dev DB
          // only (teardown) — guarded by isLocalDb() so it never seeds prod on main/CI.
          globalSetup: ["./vitest.teardown.ts"],
          // Integration tests share one Postgres table; run files serially so their
          // truncate-in-beforeEach does not race across parallel workers.
          fileParallelism: false,
        },
      },
    ],
  },
});
