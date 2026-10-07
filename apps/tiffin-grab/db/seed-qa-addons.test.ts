/**
 * One-off local QA seed: a customer whose plan carries add-ons (Extra Roti ×2, Extra Sabzi),
 * to see Edit meal's Add-ons section. Idempotent by email. A seeding SCRIPT, not a test —
 * excluded from the default run; run it deliberately:
 *   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-addons.test.ts
 *
 * Login: addons@tiffingrab.ca / Customer123!
 * Muskan's shape (Maharaja + 3 extra roti): QA_EMAIL=maharaja@tiffingrab.ca QA_PHONE=+16475550197 QA_PLAN=non-veg QA_SIZE=Maharaja
 */
import { describe, it, expect } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db/client";
import { account, addons, orderAddons, orders, plans, users } from "@/db/schema";
import { invalidateCatalogSnapshot, loadCatalogSnapshot } from "@/lib/catalog/load";
import { createOrder } from "@/lib/services/orders.service";
import { assertLocalDb } from "./is-local-db";

// The password is committed to a public repo: never seed it anywhere but a local DB.
assertLocalDb("seed-qa-addons");

const EMAIL = process.env.QA_EMAIL ?? "addons@tiffingrab.ca";
const PASSWORD = "Customer123!";

describe("seed QA add-ons customer", () => {
  it("upserts add-ons, the customer, and one live order carrying them", async () => {
    const snap0 = await loadCatalogSnapshot();
    const plan = snap0.plans.find((p) => p.key === process.env.QA_PLAN) ?? snap0.plans.find((p) => p.offeredSlots.includes("roti") && p.offeredSlots.includes("sabzi")) ?? snap0.plans[0]!;
    const [planRow] = await db.select({ id: plans.id }).from(plans).where(eq(plans.key, plan.key)).limit(1);
    for (const a of [
      { key: "qa-extra-roti", name: "Extra Roti", category: "roti", tuAmount: "0.25", pricePerTiffin: "0.75" },
      { key: "qa-extra-sabzi", name: "Extra Sabzi", category: "sabzi", tuAmount: "1.5", pricePerTiffin: "3.00" },
    ]) {
      await db.insert(addons).values({ ...a, planId: planRow!.id }).onConflictDoUpdate({ target: addons.key, set: { tuAmount: a.tuAmount } });
    }
    // The snapshot is cached (shared with the dev server): drop it so both see the new add-ons.
    await invalidateCatalogSnapshot();

    let [user] = await db.select({ id: users.id, publicId: users.publicId }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!user) {
      [user] = await db.insert(users)
        .values({ name: "QA Add-ons", email: EMAIL, phone: (process.env.QA_PHONE ?? "+16475550198"), emailVerified: true, role: "user", passwordSet: true })
        .returning({ id: users.id, publicId: users.publicId });
      await db.insert(account).values({ accountId: String(user!.id), providerId: "credential", userId: user!.id, password: await hashPassword(PASSWORD) });
    }

    const [live] = await db.select({ id: orders.id, deploymentId: orders.deploymentId }).from(orders)
      .where(and(eq(orders.userId, user!.id), inArray(orders.status, ["active", "paused"]))).limit(1);
    if (live) {
      // Keep an earlier run's order in step with the catalog's portion (1 roti per Extra Roti, like prod).
      await db.update(orderAddons).set({ tuAmount: "0.25" }).where(and(eq(orderAddons.orderId, live.id), eq(orderAddons.category, "roti")));
      console.log(`login: ${EMAIL} / ${PASSWORD}; existing order: ${live.deploymentId}`);
      return;
    }

    const snap = await loadCatalogSnapshot();
    const size = snap.mealSizes.find((m) => m.planKey === plan.key && !m.custom && (!process.env.QA_SIZE || m.name.startsWith(process.env.QA_SIZE))) ?? snap.mealSizes[0]!;
    const { deploymentId } = await createOrder(
      {
        planKey: plan.key,
        selections: {
          mealSizeId: size.publicId,
          frequencyKey: "5_day",
          persons: 1,
          mealSlots: ["lunch"],
          includeSaturday: false,
          includeSunday: false,
          durationWeeks: 2,
          startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
          addonSelections: process.env.QA_SIZE ? [{ key: "qa-extra-roti", qty: 3 }] : [{ key: "qa-extra-roti", qty: 2 }, { key: "qa-extra-sabzi", qty: 1 }],
        },
        contact: { email: EMAIL, fullName: "QA Add-ons", phone: (process.env.QA_PHONE ?? "+16475550198"), addressLine: "100 Queen St W", city: "Toronto", postalCode: "M5H 2N2" },
      },
      { ownerUserId: user!.publicId },
    );
    expect(deploymentId).toMatch(/^SUB-/);
    console.log(`login: ${EMAIL} / ${PASSWORD}; order: ${deploymentId}`);
  });
});
