import { sql } from "drizzle-orm";
import { db } from "./client";
import { account } from "./schema";
import { createLogger } from "@tiffin/commons/logger";

const log = createLogger("migrate-passwords");

export type CredUser = { id: bigint; passwordHash: string | null };

export function toAccountRows(rows: CredUser[]) {
  return rows
    .filter((r): r is CredUser & { passwordHash: string } => !!r.passwordHash)
    .map((r) => ({ accountId: String(r.id), providerId: "credential", userId: r.id, password: r.passwordHash }));
}

export async function run() {
  // Raw SQL: password_hash is intentionally KEPT in the DB (see 0010 runbook — the drop
  // is deferred to a post-verification migration); the Drizzle schema no longer maps it.
  // Idempotent — skip users that already have a credential account so re-runs never
  // insert duplicates (the account table has no unique on (user_id, provider_id)).
  const rows = await db.execute<{ id: bigint; password_hash: string | null }>(
    sql`SELECT u.id, u.password_hash FROM users u
        WHERE u.password_hash IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential'
          )`,
  );
  const credUsers: CredUser[] = rows.map((r) => ({ id: r.id, passwordHash: r.password_hash }));
  const values = toAccountRows(credUsers);
  if (values.length) await db.insert(account).values(values);
  log.info(`[migrate-passwords] inserted ${values.length} credential accounts`);
}

if (process.argv[1]?.endsWith("migrate-passwords.ts")) {
  run().then(() => process.exit(0)).catch((e) => { log.error({ err: e }, "migration failed"); process.exit(1); });
}
