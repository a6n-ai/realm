import { sql } from "drizzle-orm";
import { db } from "./client";
import { account } from "./schema";

export type CredUser = { id: bigint; passwordHash: string | null };

export function toAccountRows(rows: CredUser[]) {
  return rows
    .filter((r): r is CredUser & { passwordHash: string } => !!r.passwordHash)
    .map((r) => ({ accountId: String(r.id), providerId: "credential", userId: r.id, password: r.passwordHash }));
}

export async function run() {
  // Use raw SQL to read password_hash — it still exists in the DB at backfill time
  // (migration 0010 drops it only AFTER this runner completes; see runbook in 0010 SQL).
  const rows = await db.execute<{ id: bigint; password_hash: string | null }>(
    sql`SELECT id, password_hash FROM users WHERE password_hash IS NOT NULL`,
  );
  const credUsers: CredUser[] = rows.map((r) => ({ id: r.id, passwordHash: r.password_hash }));
  const values = toAccountRows(credUsers);
  if (values.length) await db.insert(account).values(values);
  console.info(`[migrate-passwords] inserted ${values.length} credential accounts`);
}

if (process.argv[1]?.endsWith("migrate-passwords.ts")) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}
