import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { db } from "./client";
import { account, users } from "./schema";
import { createLogger } from "@tiffin/commons/logger";

const log = createLogger("seed-admin");

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@tiffingrab.ca";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";
const MEMBER_EMAIL = process.env.SEED_MEMBER_EMAIL ?? "sales@tiffingrab.ca";
const MEMBER_PASSWORD = process.env.SEED_MEMBER_PASSWORD ?? "Member123!";

async function seedStaff(email: string, password: string, name: string, role: "admin" | "member") {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    log.info(`${role} already exists: ${email}`);
    return;
  }
  const passwordHash = await hashPassword(password);
  // Atomic: a user must never be left without its credential account (a partial
  // seed makes the next run skip it as "already exists" → an unloginnable user).
  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(users).values({ email, name, role }).returning({ id: users.id });
    await tx.insert(account).values({
      accountId: String(inserted.id),
      providerId: "credential",
      userId: inserted.id,
      password: passwordHash,
    });
  });
  log.info(`Seeded ${role}: ${email} / ${password}`);
}

async function seedSystemUser() {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.isSystem, true)).limit(1);
  if (existing) { log.info("system user already exists"); return; }
  await db.insert(users).values({
    name: "System",
    email: "system@tiffingrab.internal",
    role: "admin",
    isSystem: true,
  });
  log.info("Seeded system user (no login)");
}

async function main() {
  await seedSystemUser();
  await seedStaff(ADMIN_EMAIL, ADMIN_PASSWORD, "Tiffin Admin", "admin");
  await seedStaff(MEMBER_EMAIL, MEMBER_PASSWORD, "Sales Agent", "member");
  process.exit(0);
}

main().catch((e) => {
  log.error({ err: e }, "seed failed");
  process.exit(1);
});
