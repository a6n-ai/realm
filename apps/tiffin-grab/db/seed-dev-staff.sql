-- DEV/QA ONLY — never run this against production.
--
-- Split out of seed.sql so the catalog seed is safe to run anywhere. This file
-- creates a login whose password is written in the comment below and whose hash
-- is committed to a public repo; in production the admin comes from
-- db/seed-admin.ts with an operator-supplied password instead.
--
-- Usage (local):  psql "$DATABASE_URL" -f db/seed.sql -f db/seed-dev-staff.sql

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STAFF LOGIN (moved here from db/seed-staff.ts). One credential account.
-- DEV/QA ONLY — never seeded into production, which gets its admin from
-- db/seed-admin.ts with an operator-supplied password.
-- One account only: the admin. A seeded member and customer used to live here
-- too; extra logins nobody asked for are just standing credentials, and the e2e
-- suite provisions what it needs itself (scripts/reseed-e2e-users.ts).
-- Password is a scrypt hash — admin=AdminDev123! — precomputed because SQL
-- cannot hash. To change it:
--   node -e "import('better-auth/crypto').then(m=>m.hashPassword('NEW')).then(console.log)"
-- and replace the string below. password_set defaults true so it logs in
-- immediately. Idempotent via NOT EXISTS on email.
-- ─────────────────────────────────────────────────────────────────────────────
WITH new_admin AS (
    INSERT INTO users (public_id, name, email, role, email_verified, created_at, updated_at)
    SELECT 'usr_seed_admin', 'Admin', 'info@foodmonks.ca', 'admin', true,
           (extract(epoch FROM now()) * 1000)::bigint, (extract(epoch FROM now()) * 1000)::bigint
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'info@foodmonks.ca')
    RETURNING id
)
INSERT INTO account (public_id, account_id, provider_id, user_id, password)
SELECT 'act_seed_admin', id::text, 'credential', id,
       '15a5f1872be519cf9b058cce1641d00f:bf09821001f57b0442409f3a5ed7105a29a9552c952130a55d13138c2b1c058d0bbf8ca96be67c3ba59a0121194015343639d28cdcb01ba4fa4594d2158ac2c9'
FROM new_admin;

COMMIT;
