import { execFileSync } from "node:child_process";

// Before the whole run: clear the wallet tables that reference `users`. Each
// live-DB suite's `delete users where is_system<>true` assumes no user-FK rows
// survive, but a crashed prior run can leave a stray wallet_ledger row that then
// poisons every subsequent run's user-delete. Clearing once here at the shared
// boundary keeps the DB FK-clean without touching every suite's reset().
// ponytail: only covers stale rows from *prior* runs; a mid-run crash between
// two files can still leak. Move the clear into a shared reset() helper if that
// starts happening.
export async function setup() {
  process.env.DATABASE_URL ??= "postgres://lawbringr@localhost:5432/tiffin";
  const { db } = await import("@/db/client");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE wallet_ledger, event_payout`);
}

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
