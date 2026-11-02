import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// The DB clock, not the caller's: EC2 and Workers hold the same leases and their clocks drift.
const NOW_MS = sql`(extract(epoch from clock_timestamp()) * 1000)::bigint`;

/** One statement, no transaction: the caller's slow work (a Stripe call) never holds a connection. */
export async function acquireLease(key: string, holder: string, ttlMs: number): Promise<boolean> {
  const rows = await db.execute(sql`
    INSERT INTO runtime_leases AS l (key, holder, expires_at, updated_at)
    VALUES (${key}, ${holder}, ${NOW_MS} + ${ttlMs}, ${NOW_MS})
    ON CONFLICT (key) DO UPDATE
      SET holder = ${holder}, expires_at = ${NOW_MS} + ${ttlMs}, updated_at = ${NOW_MS}
      WHERE l.expires_at IS NULL OR l.expires_at < ${NOW_MS}
    RETURNING key`);
  return rows.length > 0;
}

export async function releaseLease(key: string, holder: string): Promise<void> {
  await db.execute(sql`
    UPDATE runtime_leases SET holder = NULL, expires_at = NULL, updated_at = ${NOW_MS}
    WHERE key = ${key} AND holder = ${holder}`);
}

/** Extends the lease only while `holder` still owns it and it has not lapsed. */
export async function renewLease(key: string, holder: string, ttlMs: number): Promise<boolean> {
  const rows = await db.execute(sql`
    UPDATE runtime_leases SET expires_at = ${NOW_MS} + ${ttlMs}, updated_at = ${NOW_MS}
    WHERE key = ${key} AND holder = ${holder} AND expires_at >= ${NOW_MS}
    RETURNING key`);
  return rows.length > 0;
}

export async function readLeaseValue(key: string): Promise<string | null> {
  const rows = await db.execute(sql`SELECT value FROM runtime_leases WHERE key = ${key}`);
  return (rows[0]?.value as string | null | undefined) ?? null;
}

/** Writing a value never touches the lease columns, so a value row can share a key with a lease. */
export async function writeLeaseValue(key: string, value: string | null): Promise<void> {
  await db.execute(sql`
    INSERT INTO runtime_leases (key, value, updated_at) VALUES (${key}, ${value}, ${NOW_MS})
    ON CONFLICT (key) DO UPDATE SET value = ${value}, updated_at = ${NOW_MS}`);
}
