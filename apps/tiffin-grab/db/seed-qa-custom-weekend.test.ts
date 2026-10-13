/**
 * One-off local QA seed: a CUSTOM meal customer who eats all week on Mon–Fri deliveries,
 * so a custom meal's Saturday and Sunday ride on Friday's truck. Idempotent by email.
 * A seeding SCRIPT, not a test — excluded from the default run (db/seed-qa-*.test.ts):
 *   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-custom-weekend.test.ts
 *
 * Login: custom-weekend@tiffingrab.ca / Customer123!
 */
import { describe, it, expect } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db/client";
import { account, orders, users } from "@/db/schema";
import { createOrder } from "@/lib/services/orders.service";
import { findOrCreateCustomMealSize, upsertPricing } from "@/lib/services/custom-meal.service";
import { assertLocalDb } from "./is-local-db";

// PASSWORD is committed to a public repo; never seed it anywhere but a local DB.
assertLocalDb("seed-qa-custom-weekend");

const EMAIL = "custom-weekend@tiffingrab.ca";
const PASSWORD = "Customer123!";
const PHONE = "+16475550291";
const NAME = "QA Custom Weekend";

const ITEMS = [
  { category: "sabzi", planKey: "veg", tuAmount: 1.5 },
  { category: "daal", planKey: "veg", tuAmount: 1 },
  { category: "rice", planKey: "veg", tuAmount: 1 },
  { category: "roti", planKey: "veg", tuAmount: 2 },
];

describe("seed QA custom-meal weekend customer", () => {
  it("upserts customer + ensures one all-week custom-meal order on Mon–Fri deliveries", async () => {
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

    for (const i of ITEMS) {
      await upsertPricing({ categoryKey: i.category, planKey: i.planKey, pricePerTu: 4, maxTu: null, active: true }, null);
    }
    const size = await findOrCreateCustomMealSize(ITEMS, { actorId: null });

    const { deploymentId } = await createOrder(
      {
        planKey: "veg",
        selections: {
          mealSizeId: size.publicId,
          frequencyKey: "5_day",
          eatingDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          persons: 1,
          mealSlots: ["lunch"],
          includeSaturday: true,
          includeSunday: true,
          durationWeeks: 2,
          startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
        },
        contact: { email: EMAIL, fullName: NAME, phone: PHONE, addressLine: "200 King St W", city: "Toronto", postalCode: "M5H 3T4" },
      },
      { ownerUserId: user!.publicId, allowCustomMeal: true },
    );
    expect(deploymentId).toMatch(/^SUB-/);
    console.log(`login: ${EMAIL} / ${PASSWORD}; order: ${deploymentId}; custom size: ${size.publicId}`);
  }, 60_000);
});
