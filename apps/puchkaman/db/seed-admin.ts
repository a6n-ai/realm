/**
 * One-off, idempotent seed: creates puchkaman's first admin user so
 * email/password login works. Forces a first-login password reset
 * (passwordSet: false — the dashboard gate redirects to /set-password).
 *
 * better-auth's email/password provider does NOT read `users.password` (no
 * such column exists) — it reads the hash from an `account` row where
 * `providerId = "credential"`. Confirmed against the identical pattern in
 * apps/tiffin-grab: db/seed.sql's staff-login insert (provider_id =
 * 'credential') and lib/services/customers.service.ts's
 * provisionCustomerByPhone, both of which pair a `users` insert with an
 * `account` insert carrying providerId: "credential" and the bcrypt hash.
 * This script does the same for puchkaman.
 *
 * Run (against prod RDS, via the tools image):
 *   SEED_ADMIN_EMAIL=puchkamancanada@gmail.com \
 *   SEED_ADMIN_PASSWORD=<temp-password> \
 *   DATABASE_URL="$DIRECT_DATABASE_URL" \
 *   tsx apps/puchkaman/db/seed-admin.ts
 *
 * (db/client.ts reads DATABASE_URL; point it at DIRECT_DATABASE_URL since
 * this is a one-shot DDL-adjacent write, not pooled app traffic.)
 */
import { eq } from "drizzle-orm";
import { hashPassword } from "@realm/auth";
import { db } from "./client";
import { account, users } from "./schema";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "puchkamancanada@gmail.com";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD is required (never hardcode a password)");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log(`admin already exists: ${email}`);
    return;
  }

  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        name: "Admin",
        email,
        emailVerified: true,
        role: "admin",
        passwordSet: false,
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
