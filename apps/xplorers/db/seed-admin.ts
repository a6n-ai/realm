/**
 * One-off, idempotent seed: creates Xplorers' first admin so email/password
 * login works. Forces a first-login password reset (passwordSet: false).
 *
 * Run:
 *   SEED_ADMIN_EMAIL=hello@xplorers.life \
 *   SEED_ADMIN_PASSWORD=<temp-password> \
 *   DATABASE_URL="$DIRECT_DATABASE_URL" \
 *   tsx apps/xplorers/db/seed-admin.ts
 */
import { eq, sql } from "drizzle-orm";
import { hashPassword } from "@foundry/auth";
import { db } from "./client";
import { account, users } from "./schema";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "hello@xplorers.life";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD is required (never hardcode a password)");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log(`admin already exists: ${email}`);
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      INSERT INTO app (id, public_id, app_id, created_at, updated_at, timezone, currency)
      SELECT v.id,
             'aps_default',
             v.id,
             (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
             (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
             'Asia/Singapore',
             'CAD'
      FROM (SELECT next_id() AS id) v
      WHERE NOT EXISTS (SELECT 1 FROM app)
    `);

    const [created] = await tx
      .insert(users)
      .values({
        name: "Admin",
        email,
        emailVerified: true,
        role: "admin",
        passwordSet: false,
        platformRole: "super_admin",
      })
      .returning({ id: users.id });
    if (!created) throw new Error("admin insert returned no row");

    await tx.insert(account).values({
      accountId: String(created.id),
      providerId: "credential",
      userId: created.id,
      password: await hashPassword(password),
    });
  });

  console.log(`admin created: ${email}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
