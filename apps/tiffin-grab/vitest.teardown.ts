import { execFileSync } from "node:child_process";

// Live-DB service suites blanket-delete their tables in teardown (users,
// dishes, menu weeks/items, app_settings, catalog), leaving the shared dev DB
// empty — which breaks the dashboard (no admin to log in, no dishes to build a
// menu from, no meal-types config). Re-run the seeds once after the whole run so
// the DB always ends in a usable state. Best-effort: a failure here must not
// fail the test run. Order matters: base settings/flags, then catalog, then
// menu (dishes), then admin user.
export function teardown() {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin" };
  for (const script of ["db:seed", "db:seed:catalog", "db:seed:menu", "db:seed:admin"]) {
    try {
      execFileSync("pnpm", [script], { stdio: "inherit", env });
    } catch (err) {
      console.warn(`[vitest] ${script} reseed after tests failed (non-fatal):`, err instanceof Error ? err.message : err);
    }
  }
}
