/**
 * One-off local QA seed: a customer who eats all week on a Mon–Fri delivery plan, so
 * Saturday and Sunday ride on Friday's truck. Idempotent by email. A seeding SCRIPT, not
 * a test — excluded from the default run (db/seed-qa-*.test.ts). Run it deliberately:
 *   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-weekend.test.ts
 *
 * Login: weekend@tiffingrab.ca / Customer123!
 */
import { describe, it, expect } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db/client";
import { account, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { createOrder } from "@/lib/services/orders.service";
import { assertLocalDb } from "./is-local-db";

// PASSWORD is committed to a public repo; never seed it anywhere but a local DB.
assertLocalDb("seed-qa-weekend");

const EMAIL = "weekend@tiffingrab.ca";
const PASSWORD = "Customer123!";
const PHONE = "+16475550198";
const NAME = "QA Weekend";
const MEAL_SIZE = "msz_item4_regular_veg";

describe("seed QA weekend customer", () => {
  it("upserts customer + ensures one all-week order on Mon–Fri deliveries", async () => {
    const password = await hashPassword(PASSWORD);
    let [user] = await db.select({ id: users.id, publicId: users.publicId }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!user) {
      [user] = await db
        .insert(users)
        .values({ name: NAME, email: EMAIL, phone: PHONE, emailVerified: true, role: "user", passwordSet: true })
        .returning({ id: users.id, publicId: users.publicId });
      await db.insert(account).values({ accountId: String(user!.id), providerId: "credential", userId: user!.id, password });
    } else {
      await db.update(account).set({ password }).where(eq(account.userId, user.id));
    }

    const [live] = await db
      .select({ deploymentId: orders.deploymentId })
      .from(orders)
      .where(and(eq(orders.userId, user!.id), inArray(orders.status, ["active", "paused"])))
      .limit(1);
    if (live) {
      console.log(`login: ${EMAIL} / ${PASSWORD}; existing order: ${live.deploymentId}`);
      return;
    }

    const snap = await loadCatalogSnapshot();
    const mealSize = snap.mealSizes.find((m) => m.publicId === MEAL_SIZE);
    expect(mealSize).toBeTruthy();

    const { deploymentId } = await createOrder(
      {
        planKey: "veg",
        selections: {
          mealSizeId: MEAL_SIZE,
          frequencyKey: "5_day",
          eatingDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          persons: 1,
          mealSlots: ["lunch"],
          includeSaturday: true,
          includeSunday: true,
          durationWeeks: 2,
          startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
        },
        contact: {
          email: EMAIL,
          fullName: NAME,
          phone: PHONE,
          addressLine: "100 Queen St W",
          city: "Toronto",
          postalCode: "M5H 2N2",
        },
      },
      { ownerUserId: user!.publicId },
    );
    expect(deploymentId).toMatch(/^SUB-/);
    console.log(`login: ${EMAIL} / ${PASSWORD}; order: ${deploymentId}`);
  }, 60_000);
});
