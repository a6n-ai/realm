/**
 * Is this DATABASE_URL a local dev database?
 *
 * Shared by vitest.teardown.ts (which silently skips reseeding when it is not)
 * and the db/seed-qa-*.test.ts scripts (which refuse to run at all). Those
 * scripts create a login with a password committed to this PUBLIC repo, so
 * "probably local" is not good enough: anything that is not unambiguously
 * loopback is treated as remote.
 *
 * Loopback alone is not enough either: deployment/prod/db-tunnel.sh forwards prod
 * RDS to 127.0.0.1:5433/5434/5435, and a test run through that tunnel truncated
 * prod's wallet tables (2026-10-05). A tunnel port or an SSL-required URL (every
 * remote URL carries sslmode; a local one never does) is therefore remote.
 */
const TUNNEL_PORTS = new Set(["5433", "5434", "5435", "5440"]);

export function isLocalDb(url: string): boolean {
  try {
    const u = new URL(url);
    // URL.hostname keeps the brackets on an IPv6 literal ("[::1]"), so comparing
    // it to a bare "::1" never matched — strip them before the check.
    const h = u.hostname.replace(/^\[|\]$/g, "");
    if (h !== "localhost" && h !== "127.0.0.1" && h !== "::1") return false;
    if (TUNNEL_PORTS.has(u.port)) return false;
    const ssl = u.searchParams.get("sslmode");
    return !ssl || ssl === "disable";
  } catch {
    return false;
  }
}

/**
 * Throws unless DATABASE_URL points at a local database. For seeding scripts,
 * where quietly doing nothing would read as success and quietly doing the work
 * would write a known credential into production.
 */
export function assertLocalDb(scriptName: string): string {
  const url = process.env.DATABASE_URL ?? "postgres://lawbringr@localhost:5432/tiffin";
  if (!isLocalDb(url)) {
    let where = "a non-local host";
    try {
      where = new URL(url).hostname;
    } catch {
      where = "an unparseable DATABASE_URL";
    }
    throw new Error(
      `${scriptName} refuses to run: DATABASE_URL points at ${where}, not a local database. ` +
        `This script seeds a fixture login whose password is committed to a public repo — ` +
        `it must never touch a remote environment.`,
    );
  }
  return url;
}
