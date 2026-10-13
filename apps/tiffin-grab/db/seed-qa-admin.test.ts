/**
 * One-off local QA seed: a staff login for walking admin pages in a browser. Idempotent by
 * email. A seeding SCRIPT, not a test — excluded from the default run (db/seed-qa-*.test.ts):
 *   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-admin.test.ts
 *
 * Login: qa-admin@tiffingrab.ca / Admin123!
 */
import { describe, it } from "vitest";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { assertLocalDb } from "./is-local-db";

// PASSWORD is committed to a public repo; never seed it anywhere but a local DB.
assertLocalDb("seed-qa-admin");

const EMAIL = "qa-admin@tiffingrab.ca";
const PASSWORD = "Admin123!";

describe("seed QA admin", () => {
  it("upserts an admin login", async () => {
    const password = await hashPassword(PASSWORD);
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (existing) {
      await db.update(users).set({ role: "admin", passwordSet: true, emailVerified: true }).where(eq(users.id, existing.id));
      await db.update(account).set({ password }).where(eq(account.userId, existing.id));
    } else {
      const [u] = await db
        .insert(users)
        .values({ name: "QA Admin", email: EMAIL, emailVerified: true, role: "admin", passwordSet: true })
        .returning({ id: users.id });
      await db.insert(account).values({ accountId: String(u!.id), providerId: "credential", userId: u!.id, password });
    }
    console.log(`login: ${EMAIL} / ${PASSWORD}`);
  });
});
