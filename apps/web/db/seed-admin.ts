import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { db } from "./client";
import { users } from "./schema";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@tiffingrab.ca";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "Admin123!";

async function main() {
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
  if (existing) {
    console.log(`Admin already exists: ${ADMIN_EMAIL}`);
    process.exit(0);
  }
  await db.insert(users).values({
    email: ADMIN_EMAIL,
    name: "Tiffin Admin",
    passwordHash: await hashPassword(ADMIN_PASSWORD),
    role: "admin",
  });
  console.log(`Seeded admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
