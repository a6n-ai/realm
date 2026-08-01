import { db } from "../db/client";
import { sql } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";

/**
 * PROD SAFETY: this script writes credentials for info@foodmonks.ca — which is also the
 * real production admin — and unconditionally sets password_set = true, which would
 * disable the forced /set-password gate on that account. Run against prod by accident
 * (a stale DATABASE_URL is all it takes) it would hand out a known login.
 *
 * Same guard vitest.teardown.ts uses: local databases only, no exceptions.
 */
function isLocalDb(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1";
  } catch {
    return false;
  }
}

// Defaults mirror e2e/helpers/auth.ts, so `pnpm test:e2e` logs in with what this writes.
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "info@foodmonks.ca";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "AdminDev123!";
const CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? "customer@tiffingrab.ca";
const CUSTOMER_PASSWORD = process.env.E2E_CUSTOMER_PASSWORD ?? "Customer123!";

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!isLocalDb(dbUrl)) {
    throw new Error(
      "reseed-e2e-users refuses to run: DATABASE_URL is not a local database. " +
        "These are throwaway e2e credentials and must never reach a deployed environment.",
    );
  }

  // Hashed at runtime with the app's own hasher. The admin hash used to be a hardcoded
  // bcrypt string, which stopped working at the scrypt cutover — packages/auth has no
  // bcrypt fallback and verifyPassword fail-closes on a foreign format, so every e2e
  // admin login silently failed. Anything hardcoded here rots the same way.
  const [adminHash, customerHash] = await Promise.all([
    hashPassword(ADMIN_PASSWORD),
    hashPassword(CUSTOMER_PASSWORD),
  ]);

  await db.execute(sql`
WITH new_admin AS (
    INSERT INTO users (public_id, name, email, role, created_at, updated_at, password_set, email_verified)
    SELECT 'usr_seed_admin', 'Admin', ${ADMIN_EMAIL}, 'admin',
           (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint, true, true
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${ADMIN_EMAIL})
    RETURNING id
)
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_admin', id::text, 'credential', id, ${adminHash}
FROM new_admin;
`);

  // Existing admin: attach a credential if one is missing, then refresh the hash — a stale
  // hash from an earlier run, or from before the scrypt cutover, would otherwise leave the
  // login broken with the row looking perfectly fine.
  await db.execute(sql`
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_admin', u.id::text, 'credential', u.id, ${adminHash}
FROM users u
WHERE u.email = ${ADMIN_EMAIL}
  AND NOT EXISTS (
    SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential'
  );
`);
  await db.execute(sql`
UPDATE account SET password = ${adminHash}
FROM users u
WHERE u.id = account.user_id AND u.email = ${ADMIN_EMAIL} AND account.provider_id = 'credential';
`);

  await db.execute(sql`
UPDATE users SET password_set = true, email_verified = true
WHERE email = ${ADMIN_EMAIL};
`);

  await db.execute(sql`
WITH new_cust AS (
    INSERT INTO users (public_id, name, email, phone, role, created_at, updated_at, password_set, email_verified)
    SELECT 'usr_seed_customer', 'QA Customer', ${CUSTOMER_EMAIL}, '+16475550001', 'user',
           (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint, true, true
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${CUSTOMER_EMAIL})
    RETURNING id
)
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_customer', id::text, 'credential', id, ${customerHash}
FROM new_cust;
`);

  await db.execute(sql`
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_customer', u.id::text, 'credential', u.id, ${customerHash}
FROM users u
WHERE u.email = ${CUSTOMER_EMAIL}
  AND NOT EXISTS (
    SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential'
  );
`);
  await db.execute(sql`
UPDATE account SET password = ${customerHash}
FROM users u
WHERE u.id = account.user_id AND u.email = ${CUSTOMER_EMAIL} AND account.provider_id = 'credential';
`);

  const r = await db.execute(
    sql`select email, role, password_set from users where email in (${ADMIN_EMAIL}, ${CUSTOMER_EMAIL})`,
  );
  console.log(r);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
