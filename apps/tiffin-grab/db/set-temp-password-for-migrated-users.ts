/**
 * One-off ops tool: issues the SAME operator-set temp password to every user
 * created by migrate-wordpress-customers.ts (identified via its MIGRATION_TAG
 * order_activities note), for internal team testing of the import only.
 *
 * Sets passwordSet=false on each account (the same flag an admin invite uses)
 * so the app's own first-login flow forces a real password choice before any
 * customer-facing use — this does NOT bypass that flow, it front-loads a
 * known password purely so staff can log in and verify the import today.
 *
 * Usage:
 *   TEMP_PASSWORD=... DATABASE_URL=... pnpm exec tsx db/set-temp-password-for-migrated-users.ts
 *
 * Clear this before any customer is ever told they have an account: run
 * `pnpm exec tsx db/set-temp-password-for-migrated-users.ts --clear` (same env)
 * to delete the credential rows this script wrote and flip passwordSet back
 * to false for a clean force-choose state.
 */
import { eq, and } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { db } from "./client";
import { account, orderActivities, orders, users } from "./schema";

const MIGRATION_TAG = "Migrated from WordPress export";

async function migratedUserIds(): Promise<bigint[]> {
  const rows = await db
    .selectDistinct({ userId: orders.userId })
    .from(orders)
    .innerJoin(orderActivities, eq(orderActivities.orderId, orders.id))
    .where(eq(orderActivities.note, MIGRATION_TAG));
  return rows.map((r) => r.userId).filter((id): id is bigint => id !== null);
}

async function clear(userIds: bigint[]): Promise<void> {
  for (const userId of userIds) {
    await db.delete(account).where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
    await db.update(users).set({ passwordSet: false }).where(eq(users.id, userId));
  }
  console.log(`Cleared temp credentials for ${userIds.length} migrated users.`);
}

async function main() {
  const clearMode = process.argv.includes("--clear");
  const userIds = await migratedUserIds();
  if (userIds.length === 0) {
    console.log("No migrated users found (no order_activities with the migration tag).");
    return;
  }

  if (clearMode) {
    await clear(userIds);
    return;
  }

  const password = process.env.TEMP_PASSWORD;
  if (!password || password.length < 8) throw new Error("TEMP_PASSWORD env var is required (min 8 chars)");
  const hash = await hashPassword(password);

  let written = 0;
  for (const userId of userIds) {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
        .limit(1);
      if (existing) {
        await tx.update(account).set({ password: hash }).where(eq(account.id, existing.id));
      } else {
        await tx.insert(account).values({
          accountId: String(userId),
          providerId: "credential",
          userId,
          password: hash,
        });
      }
      await tx.update(users).set({ passwordSet: false }).where(eq(users.id, userId));
    });
    written += 1;
  }
  console.log(`Set the temp password for ${written} migrated users. passwordSet=false — each will be forced to choose their own on first real login.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
