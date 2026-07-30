import { db } from "../db/client";
import { sql } from "drizzle-orm";

async function main() {
  await db.execute(sql.raw(`
WITH new_admin AS (
    INSERT INTO users (public_id, name, email, role, created_at, updated_at, password_set, email_verified)
    SELECT 'usr_seed_admin', 'Admin', 'info@foodmonks.ca', 'admin',
           (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint, true, true
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'info@foodmonks.ca')
    RETURNING id
)
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_admin', id::text, 'credential', id,
       '$2b$10$JNPi3ia9w9BkjJXhHA3s/eLV05yzvLY48Mk13ZMhIvXuqkSpJ/ZAm'
FROM new_admin;
`));

  // If admin exists but account was deleted, reattach credential
  await db.execute(sql.raw(`
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_admin', u.id::text, 'credential', u.id,
       '$2b$10$JNPi3ia9w9BkjJXhHA3s/eLV05yzvLY48Mk13ZMhIvXuqkSpJ/ZAm'
FROM users u
WHERE u.email = 'info@foodmonks.ca'
  AND NOT EXISTS (
    SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential'
  );
`));

  await db.execute(sql.raw(`
UPDATE users SET password_set = true, email_verified = true
WHERE email = 'info@foodmonks.ca';
`));

  // QA customer
  const { hashPassword } = await import("../lib/auth/password");
  const password = await hashPassword("Customer123!");
  await db.execute(sql.raw(`
WITH new_cust AS (
    INSERT INTO users (public_id, name, email, phone, role, created_at, updated_at, password_set, email_verified)
    SELECT 'usr_seed_customer', 'QA Customer', 'customer@tiffingrab.ca', '+16475550001', 'user',
           (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint, true, true
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'customer@tiffingrab.ca')
    RETURNING id
)
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_customer', id::text, 'credential', id, '${password.replace(/'/g, "''")}'
FROM new_cust;
`));

  await db.execute(sql.raw(`
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_customer', u.id::text, 'credential', u.id, '${password.replace(/'/g, "''")}'
FROM users u
WHERE u.email = 'customer@tiffingrab.ca'
  AND NOT EXISTS (
    SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential'
  );
`));

  const r = await db.execute(sql`select email, role, password_set from users where email in ('info@foodmonks.ca','customer@tiffingrab.ca')`);
  console.log(r);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
