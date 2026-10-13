import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, dishes, mealSelections, menuItems, menuWeeks, orders, payments, users } from "@/db/schema";
import { attachDishToPlans, categoryIdFor, testPlanId } from "@/db/test-helpers";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { getKitchenPackingSheet, extraTiffinLabel } = await import("../kitchen-packing-sheet.service");
const { selectionsService } = await import("@/lib/menu/selections.service");

const MONDAY = (() => {
  const d = new Date(Date.now() + 70 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

const DEPLOYMENT = "SUB-KPKSH1";
const USER_EMAIL = "kpksh@test.invalid";
const DISH_PREFIX = "KPKSH-";

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, DEPLOYMENT));
  const orderIds = mine.map((o) => o.id);
  if (orderIds.length) {
    await db.delete(mealSelections).where(inArray(mealSelections.orderId, orderIds));
    await db.delete(payments).where(inArray(payments.orderId, orderIds));
    await db.delete(deliveries).where(inArray(deliveries.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }
  const weeks = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.weekStart, MONDAY));
  if (weeks.length) {
    const weekIds = weeks.map((w) => w.id);
    await db.delete(menuItems).where(inArray(menuItems.menuWeekId, weekIds));
    await db.delete(menuWeeks).where(inArray(menuWeeks.id, weekIds));
  }
  await db.delete(dishes).where(like(dishes.name, `${DISH_PREFIX}%`));
  await db.delete(users).where(eq(users.email, USER_EMAIL));
}

describe("getKitchenPackingSheet", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const nonVeg = snap.plans.find((p) => p.key === "non-veg")!;
    const size =
      snap.mealSizes.find((m) => m.key === "maharaja_nonveg") ??
      snap.mealSizes.find((m) => m.planKey === "non-veg")!;
    expect(nonVeg).toBeDefined();
    expect(size).toBeDefined();

    const [u] = await db
      .insert(users)
      .values({ email: USER_EMAIL, phone: "+16475557022", role: "user" })
      .returning();
    const [o] = await db
      .insert(orders)
      .values({
        userId: u.id,
        planId: nonVeg.id,
        mealSizeId: size.id,
        frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
        persons: 1,
        mealSlots: ["lunch"],
        // Match maharaja composition row counts (one roti row @ 2 TU = 8 pieces).
        categoryCounts: { sabzi: 2, daal: 1, salad: 1, raita: 1, rice: 1, roti: 1 },
        durationWeeks: 1,
        startDate: MONDAY,
        tiffinCount: 5,
        perTiffinPrice: "10.00",
        pricingSnapshot: {},
        total: "50.00",
        status: "active",
        deploymentId: DEPLOYMENT,
        fullName: "Ajay Tester",
        addressLine: "1 Queen St",
        city: "Toronto",
        postalCode: "M5V 2T6",
      })
      .returning();
    order = o;

    await db.insert(payments).values({
      orderId: o.id,
      amount: o.total,
      status: "simulated_paid",
      method: "simulated",
      capturedAt: Date.now(),
    });

    await db.insert(deliveries).values({
      orderId: o.id,
      deliveryDate: MONDAY,
      status: "scheduled",
      cutoffAt: Date.now() + 1e9,
    });

    const [w] = await db
      .insert(menuWeeks)
      .values({
        weekStart: MONDAY,
        status: "released",
        orderCutoff: new Date("2999-01-01").getTime(),
      })
      .returning();
    week = w;

    const [paneer] = await db.insert(dishes).values({ planId: await testPlanId(), name: `${DISH_PREFIX}Saag Paneer`, category: "sabzi" }).returning();
    await attachDishToPlans(paneer.id);
    const [chicken] = await db.insert(dishes).values({ planId: await testPlanId(), name: `${DISH_PREFIX}Chilli Chicken`, category: "curry" }).returning();
    await attachDishToPlans(chicken.id, ["non-veg"]);
    const [dal] = await db.insert(dishes).values({ planId: await testPlanId(), name: `${DISH_PREFIX}Kali Dal`, category: "daal" }).returning();
    await attachDishToPlans(dal.id);
    const [rice] = await db.insert(dishes).values({ planId: await testPlanId(), name: `${DISH_PREFIX}Jeera Rice`, category: "rice" }).returning();
    await attachDishToPlans(rice.id);
    const [roti] = await db.insert(dishes).values({ planId: await testPlanId(), name: `${DISH_PREFIX}Roti`, category: "roti" }).returning();
    await attachDishToPlans(roti.id);

    const sabzi = await categoryIdFor("sabzi");
    const daal = await categoryIdFor("daal");
    const riceCat = await categoryIdFor("rice");
    const rotiCat = await categoryIdFor("roti");
    await db.insert(menuItems).values([
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: sabzi, dishId: paneer.id, isDefault: true, position: 1 },
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: sabzi, dishId: chicken.id, isDefault: false, position: 2 },
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: daal, dishId: dal.id, isDefault: true, position: 1 },
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: riceCat, dishId: rice.id, isDefault: true, position: 1 },
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: rotiCat, dishId: roti.id, isDefault: true, position: 1 },
    ]);
  });
  afterAll(reset);

  it("one order = one row with Item1…ItemN cells showing dish + converted OZ/pcs", async () => {
    const sheet = await getKitchenPackingSheet(MONDAY);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0]?.orderId).toBe(DEPLOYMENT);
    expect(sheet.rows[0]?.customerName).toBe("Ajay Tester");
    expect(sheet.rows[0]?.deliveryDate).toBe(MONDAY);
    expect(sheet.rows[0]?.planName.toLowerCase()).toMatch(/non/);
    expect(sheet.rows[0]?.mealSizeName.length).toBeGreaterThan(0);

    expect(sheet.itemHeaders[0]).toBe("Item1");
    expect(sheet.itemHeaders.every((h) => /^Item\d+$/.test(h))).toBe(true);
    expect(sheet.itemHeaders.length).toBe(sheet.rows[0]?.items.length);

    const items = sheet.rows[0]!.items.join(" | ");
    expect(items).toMatch(/Chilli Chicken|Saag Paneer/);
    expect(items).toMatch(/— \d+ OZ/);
    expect(items).not.toMatch(/× 1\b/);
    expect(items).toMatch(/Kali Dal/);
    // Count: "Dish — total"; a single one is just the dish — maharaja roti row @ 2 TU → "… — 8".
    expect(items).toMatch(/Roti[^|]* — 8\b/i);
    expect(sheet.rows[0]?.items).toContain(`${DISH_PREFIX}Jeera Rice`);
    expect(items).not.toMatch(/unit\s*×/i);
    expect(items).not.toMatch(/roti\s*×/i);
    expect(items).not.toMatch(/portion/);
    expect(sheet.rows[0]?.items.filter((c) => /roti/i.test(c))).toHaveLength(1);
    expect(sheet.summary.find((s) => s.dish.includes("Roti"))?.portion).toBe("roti");
    expect(sheet.summary.find((s) => s.dish.includes("Roti"))?.totalQuantity).toBe(8);
    expect(sheet.summary.some((s) => s.dish.includes("Kali Dal") && s.totalQuantity >= 1)).toBe(true);
  });

  it("updates item cells when the customer changes a pick", async () => {
    const before = await getKitchenPackingSheet(MONDAY);
    expect(before.rows[0]?.items.some((c) => c.includes("Chilli Chicken"))).toBe(true);

    const paneerPublicId = (
      await db.select({ publicId: dishes.publicId }).from(dishes).where(eq(dishes.name, `${DISH_PREFIX}Saag Paneer`))
    )[0]!.publicId;
    await selectionsService.setSelection({
      order,
      menuWeek: week,
      dayOfWeek: "mon",
      slot: "sabzi",
      personIndex: 1,
      pickIndex: 1,
      dishPublicId: paneerPublicId,
    });

    const after = await getKitchenPackingSheet(MONDAY);
    expect(after.rows[0]?.items.some((c) => c.includes("Saag Paneer"))).toBe(true);
  });

  it("reflects applied category swaps on packing item portions", async () => {
    const { deliveryCategorySwaps, mealSizeItems } = await import("@/db/schema");
    const snap = await loadCatalogSnapshot();
    const size =
      snap.mealSizes.find((m) => m.key === "maharaja_nonveg") ??
      snap.mealSizes.find((m) => m.planKey === "non-veg")!;

    const prior = await db.select().from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, size.id));
    // Shared rows (daal/rice/roti/side) target the base plan in the real composition; only the
    // non-veg main targets the size's own plan. Dish eligibility follows each row's plan.
    const shared = prior.find((r) => r.category === "rice")!.planId;
    try {
      // Force multi-row sabzi 1.5+1.0 TU (=12oz+8oz when 1 TU = 8oz).
      await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, size.id));
      await db.insert(mealSizeItems).values([
        { mealSizeId: size.id, planId: size.planId, name: "Main", category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
        { mealSizeId: size.id, planId: shared, name: "Side", category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
        { mealSizeId: size.id, planId: shared, name: "Daal", category: "daal", tuAmount: "1.00", sortOrder: 2 },
        { mealSizeId: size.id, planId: shared, name: "Rice", category: "rice", tuAmount: "1.00", sortOrder: 3 },
        ...Array.from({ length: 8 }, (_, i) => ({
          mealSizeId: size.id,
          planId: shared,
          name: "Roti",
          category: "roti",
          tuAmount: "0.25",
          sortOrder: 4 + i,
        })),
      ]);
      await db.update(orders).set({ categoryCounts: { sabzi: 2, daal: 1, rice: 1, roti: 8 } }).where(eq(orders.id, order.id));

      const before = await getKitchenPackingSheet(MONDAY);
      const beforeItems = before.rows[0]?.items.join(" | ") ?? "";
      expect(beforeItems).toMatch(/12\s*OZ/i);
      expect(beforeItems).toMatch(/8\s*OZ/i);
      expect(beforeItems).not.toMatch(/24\s*OZ/i);
      // Count: eight 0.25-TU roti slots → "… — 8"; one rice → just the dish.
      expect(beforeItems).toMatch(/Roti[^|]* — 8\b/i);
      expect(beforeItems).not.toMatch(/Rice[^|]* — \d/i);
      expect(beforeItems).not.toMatch(/unit\s*×/i);
      expect(before.rows[0]?.items.filter((c) => /roti/i.test(c))).toHaveLength(1);

      const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
      await db.insert(deliveryCategorySwaps).values({
        deliveryId: delivery!.id,
        fromCategory: "sabzi",
        toCategory: "daal",
        qtyFrom: 1,
        qtyTo: 1,
        forDate: null,
      });

      const after = await getKitchenPackingSheet(MONDAY);
      const afterItems = after.rows[0]?.items.join(" | ") ?? "";
      const cells = after.rows[0]?.items ?? [];
      // Front-removed 12oz sabzi; remaining sabzi is 8oz. Same-unit swap: the daal it became keeps 12oz.
      expect(cells.filter((c) => c.includes("Chilli Chicken") || c.includes("Saag Paneer")).join(" | ")).not.toMatch(/12\s*OZ/i);
      expect(cells.filter((c) => c.includes("Kali Dal")).join(" | ")).toMatch(/12\s*OZ/i);
      expect(afterItems).toMatch(/8\s*OZ/i);
      expect(afterItems).not.toMatch(/24\s*OZ/i);
    } finally {
      await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, size.id));
      if (prior.length) {
        await db.insert(mealSizeItems).values(
          prior.map(({ id: _id, publicId: _p, ...rest }) => rest),
        );
      }
    }
  });

  it("count packing: two rice slots show as 2 rice, not unit × format", async () => {
    const { mealSizeItems } = await import("@/db/schema");
    const snap = await loadCatalogSnapshot();
    const size =
      snap.mealSizes.find((m) => m.key === "maharaja_nonveg") ??
      snap.mealSizes.find((m) => m.planKey === "non-veg")!;
    const prior = await db.select().from(mealSizeItems).where(eq(mealSizeItems.mealSizeId, size.id));
    // Shared rows (daal/rice/roti/side) target the base plan in the real composition; only the
    // non-veg main targets the size's own plan. Dish eligibility follows each row's plan.
    const shared = prior.find((r) => r.category === "rice")!.planId;
    try {
      await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, size.id));
      await db.insert(mealSizeItems).values([
        { mealSizeId: size.id, planId: size.planId, name: "Main", category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
        { mealSizeId: size.id, planId: shared, name: "Rice", category: "rice", tuAmount: "1.00", sortOrder: 1 },
        { mealSizeId: size.id, planId: shared, name: "Rice", category: "rice", tuAmount: "1.00", sortOrder: 2 },
        { mealSizeId: size.id, planId: shared, name: "Roti", category: "roti", tuAmount: "0.75", sortOrder: 3 },
      ]);
      await db
        .update(orders)
        .set({ categoryCounts: { sabzi: 1, rice: 2, roti: 1 } })
        .where(eq(orders.id, order.id));

      const sheet = await getKitchenPackingSheet(MONDAY);
      const items = sheet.rows[0]?.items.join(" | ") ?? "";
      expect(items).toMatch(/Rice[^|]* — 2\b/i);
      expect(items).toMatch(/Roti[^|]* — 3\b/i);
      expect(items).not.toMatch(/unit\s*×/i);
      expect(items).not.toMatch(/2 unit/i);
      expect(sheet.summary.find((s) => /rice/i.test(s.dish))).toEqual(
        expect.objectContaining({ portion: "rice", totalQuantity: 2 }),
      );
    } finally {
      await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, size.id));
      if (prior.length) {
        await db.insert(mealSizeItems).values(
          prior.map(({ id: _id, publicId: _p, ...rest }) => rest),
        );
      }
    }
  });

  it("excludes payment-review orders from the packing sheet", async () => {
    await db
      .update(payments)
      .set({ status: "awaiting_payment", capturedAt: null })
      .where(eq(payments.orderId, order.id));
    const sheet = await getKitchenPackingSheet(MONDAY);
    expect(sheet.rows).toEqual([]);
  });
});

describe("extraTiffinLabel", () => {
  it("names where a repeat tiffin came from", () => {
    expect(extraTiffinLabel("2026-10-07")).toBe("Extra · moved from Wed, Oct 7");
    expect(extraTiffinLabel(null)).toBe("Extra · from pool");
    expect(extraTiffinLabel(undefined)).toBe("Extra");
  });
});
