import { eq, sql } from "drizzle-orm";
import { hashPassword } from "@foundry/auth";
import { db } from "./client";
import { account, apiKeys, app, tenants, users } from "./schema";
import { generateApiKey } from "../lib/api-keys";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "ops@relay.local";
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!password) throw new Error("SEED_ADMIN_PASSWORD is required");

  await db.execute(sql`
    INSERT INTO app (id, public_id, app_id, created_at, updated_at, name, timezone)
    SELECT v.id, 'aps_default', v.id,
           (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
           (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT,
           'Relay', 'America/Toronto'
    FROM (SELECT next_id() AS id) v
    WHERE NOT EXISTS (SELECT 1 FROM app)
  `);

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!existing) {
    const hash = await hashPassword(password);
    await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({
        email,
        name: "Relay operator",
        emailVerified: true,
        role: "admin",
        status: "active",
        passwordSet: true,
      }).returning();
      await tx.insert(account).values({
        accountId: user.id.toString(),
        providerId: "credential",
        userId: user.id,
        password: hash,
      });
    });
    console.log(`operator created: ${email}`);
  } else {
    console.log(`operator already exists: ${email}`);
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, "realm-dev")).limit(1);
  if (!tenant) {
    const [created] = await db.insert(tenants).values({ name: "Realm", slug: "realm-dev" }).returning();
    const key = generateApiKey();
    await db.insert(apiKeys).values({
      tenantId: created.id,
      name: "default",
      keyPrefix: key.prefix,
      keyHash: key.hash,
    });
    console.log(`tenant realm-dev API key (copy now): ${key.secret}`);
  } else {
    console.log("tenant realm-dev already exists");
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
