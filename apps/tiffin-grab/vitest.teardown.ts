// Before the whole run: clear the wallet tables that reference `users`. Each
// live-DB suite's `delete users where is_system<>true` assumes no user-FK rows
// survive, but a crashed prior run can leave a stray wallet_ledger row that then
// poisons every subsequent run's user-delete. Clearing once here at the shared
// boundary keeps the DB FK-clean without touching every suite's reset().
export async function setup() {
  const dbUrl = (process.env.DATABASE_URL ??= "postgres://lawbringr@localhost:5432/tiffin");
  // Dedicated one-shot client, closed immediately — importing @/db/client here
  // would open its long-lived pool in the main process and hang vitest's exit.
  const postgres = (await import("postgres")).default;
  const client = postgres(dbUrl, { prepare: false, max: 1 });
  await client`TRUNCATE wallet_ledger, event_payout`;
  await client.end();
}

// Live-DB service suites blanket-delete their tables (users, dishes, menu, catalog,
// app_settings) and truncate wallet tables, leaving the shared dev DB empty. The
// integration suites need that data present, so restore it after the run from the
// single SQL data seed (db/seed.sql) — which now also carries the two login-able
// staff accounts. Best-effort: a failure must not fail the run.
//
// PROD SAFETY: this ONLY runs against a local DB. On main/CI, DATABASE_URL points
// at prod — isLocalDb() short-circuits so tests never seed or wipe prod.

function isLocalDb(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

export async function teardown() {
  const dbUrl = process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin";
  if (!isLocalDb(dbUrl)) return; // never reseed prod

  const postgres = (await import("postgres")).default;
  const client = postgres(dbUrl, { prepare: false, max: 1 });
  try {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const sqlPath = fileURLToPath(new URL("./db/seed.sql", import.meta.url));
    await client.unsafe(readFileSync(sqlPath, "utf8"));
  } catch (err) {
    console.warn("[vitest] local reseed after tests failed (non-fatal):", err instanceof Error ? err.message : err);
  } finally {
    await client.end();
  }
}
