import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, dishes, mealSelections, menuItems, menuWeeks, orders, users } from "@/db/schema";
import { attachDishToPlans, categoryIdFor } from "@/db/test-helpers";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { getPackingLabels } = await import("../labels.service");
const { selectionsService } = await import("@/lib/menu/selections.service");

const MONDAY = (() => {
  const d = new Date(Date.now() + 70 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

const DEPLOYMENT = "SUB-PKGLBL1";
const USER_EMAIL = "pkglbl@test.invalid";
const DISH_PREFIX = "PKGLBL-";

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;

async function reset() {
  const mine = await db.select({ id: orders.id }).from(orders).where(eq(orders.deploymentId, DEPLOYMENT));
  const orderIds = mine.map((o) => o.id);
  if (orderIds.length) {
    await db.delete(mealSelections).where(inArray(mealSelections.orderId, orderIds));
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

describe("getPackingLabels (customer pick + plan defaults)", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    const nonVeg = snap.plans.find((p) => p.key === "non-veg")!;
    const size = snap.mealSizes.find((m) => m.key === "maharaja_nonveg") ?? snap.mealSizes.find((m) => m.planKey === "non-veg")!;
    expect(nonVeg).toBeDefined();
    expect(size).toBeDefined();

    const [u] = await db.insert(users).values({
      email: USER_EMAIL, phone: "+16475557011", role: "user",
    }).returning();
    const [o] = await db.insert(orders).values({
      userId: u.id, planId: nonVeg.id, mealSizeId: size.id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
      persons: 1, mealSlots: ["lunch"],
      // Maharaja-shaped: 12oz sabzi + 8oz sabzi + daal + rice (roti/salad omitted to keep the sheet readable).
      categoryCounts: { sabzi: 2, daal: 1, rice: 1 },
      durationWeeks: 1, startDate: MONDAY, tiffinCount: 5, perTiffinPrice: "10.00",
      pricingSnapshot: {}, total: "50.00", status: "active",
      deploymentId: DEPLOYMENT, fullName: "Ajay Tester", addressLine: "1 Queen St",
      city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    order = o;

    await db.insert(deliveries).values({
      orderId: o.id, deliveryDate: MONDAY, status: "scheduled", cutoffAt: Date.now() + 1e9,
    });

    const [w] = await db.insert(menuWeeks).values({
      weekStart: MONDAY, status: "released", orderCutoff: new Date("2999-01-01").getTime(),
    }).returning();
    week = w;

    const [paneer] = await db.insert(dishes).values({ name: `${DISH_PREFIX}Saag Paneer` }).returning();
    await attachDishToPlans(paneer.id);
    const [chicken] = await db.insert(dishes).values({ name: `${DISH_PREFIX}Chilli Chicken` }).returning();
    await attachDishToPlans(chicken.id, ["non-veg"]);
    const [dal] = await db.insert(dishes).values({ name: `${DISH_PREFIX}Kali Dal` }).returning();
    await attachDishToPlans(dal.id);
    const [rice] = await db.insert(dishes).values({ name: `${DISH_PREFIX}Jeera Rice` }).returning();
    await attachDishToPlans(rice.id);

    const sabzi = await categoryIdFor("sabzi");
    const daal = await categoryIdFor("daal");
    const riceCat = await categoryIdFor("rice");
    await db.insert(menuItems).values([
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: sabzi, dishId: paneer.id, isDefault: true, position: 1 },
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: sabzi, dishId: chicken.id, isDefault: false, position: 2 },
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: daal, dishId: dal.id, isDefault: true, position: 1 },
      { menuWeekId: w.id, dayOfWeek: "mon", categoryId: riceCat, dishId: rice.id, isDefault: true, position: 1 },
    ]);
  });
  afterAll(reset);

  it("exports meal size and packs the plan's category counts with a non-veg default on the largest sabzi", async () => {
    const [row] = await getPackingLabels(MONDAY);
    expect(row.mealSizeName.length).toBeGreaterThan(0);
    expect(row.planName.toLowerCase()).toMatch(/non/);
    const rice = row.items.find((i) => i.name.includes("Jeera Rice"));
    const dal = row.items.find((i) => i.name.includes("Kali Dal"));
    const sabzi = row.items.find((i) => i.name.includes("Chicken") || i.name.includes("Paneer"));
    expect(dal?.qty).toBe(1);
    expect(dal?.name).toMatch(/Kali Dal \d+(\.\d+)?oz/);
    expect(rice?.qty).toBe(1);
    expect(rice?.name).toBe(`${DISH_PREFIX}Jeera Rice 1`);
    expect(sabzi?.qty).toBe(2);
    expect(sabzi?.name).toContain("Chilli Chicken");
    expect(sabzi?.name).toContain("Saag Paneer");
    expect(sabzi?.name).toMatch(/\d+(\.\d+)?oz/);
  });

  it("replaces the default sabzi on the sheet after the customer picks a different dish", async () => {
    const before = await getPackingLabels(MONDAY);
    expect(before[0]?.items.some((i) => i.name.includes("Chilli Chicken"))).toBe(true);

    const paneerPublicId = (await db.select({ publicId: dishes.publicId }).from(dishes)
      .where(eq(dishes.name, `${DISH_PREFIX}Saag Paneer`)))[0]!.publicId;
    await selectionsService.setSelection({
      order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi",
      personIndex: 1, pickIndex: 1, dishPublicId: paneerPublicId,
    });

    const after = await getPackingLabels(MONDAY);
    const sabzi = after[0]?.items.find((i) => i.name.includes("Paneer") || i.name.includes("Chicken"));
    expect(sabzi?.name.startsWith(`${DISH_PREFIX}Saag Paneer`)).toBe(true);
  });
});
