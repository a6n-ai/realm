import { execFileSync } from "node:child_process";

// Live-DB service suites blanket-delete non-system users in teardown, leaving the
// shared dev DB without a loginnable admin. Re-run the admin seed once after the
// whole run so the DB always ends in a usable state. Best-effort: a failure here
// must not fail the test run.
export function teardown() {
  try {
    execFileSync("pnpm", ["db:seed:admin"], {
      stdio: "inherit",
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin" },
    });
  } catch (err) {
    console.warn("[vitest] admin reseed after tests failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}
