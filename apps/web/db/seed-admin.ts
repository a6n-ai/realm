import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { db } from "./client";
import { account, users } from "./schema";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@tiffingrab.ca";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";
const MEMBER_EMAIL = process.env.SEED_MEMBER_EMAIL ?? "sales@tiffingrab.ca";
const MEMBER_PASSWORD = process.env.SEED_MEMBER_PASSWORD ?? "Member123!";

async function seedStaff(email: string, password: string, name: string, role: "admin" | "member") {
  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log(`${role} already exists: ${email}`);
    return;
  }
  const [inserted] = await db.insert(users).values({ email, name, role }).returning({ id: users.id });
  await db.insert(account).values({
    accountId: String(inserted.id),
    providerId: "credential",
    userId: inserted.id,
    password: await hashPassword(password),
  });
  console.log(`Seeded ${role}: ${email} / ${password}`);
}

async function main() {
  await seedStaff(ADMIN_EMAIL, ADMIN_PASSWORD, "Tiffin Admin", "admin");
  await seedStaff(MEMBER_EMAIL, MEMBER_PASSWORD, "Sales Agent", "member");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
