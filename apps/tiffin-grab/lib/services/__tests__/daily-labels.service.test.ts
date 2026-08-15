import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import {
  deliveries,
  dishes,
  mealSelections,
  mealSizeItems,
  menuItems,
  menuWeeks,
  orders,
  users,
} from "@/db/schema";
import { attachDishToPlans, categoryIdFor } from "@/db/test-helpers";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { dailyLabelSheet } = await import("../daily-labels.service");

// A Monday far enough out that its cutoff has not elapsed.
const MONDAY = (() => {
  const d = new Date(Date.now() + 56 * 86400000);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
})();

let order: typeof orders.$inferSelect;
let week: typeof menuWeeks.$inferSelect;
let paneerId: bigint;
let bhindiPublicId: string;
let mealSizeId: bigint;

// Scoped to this suite's own rows, never a global wipe: these suites run in parallel against
// one database, and `delete from orders` also trips payments' FK on any seed data present.
const DEPLOYMENT = "SUB-LBL001";
const USER_PREFIX = "lbl";
const DISH_PREFIX = "LBLTEST-";

async function reset() {
  const mine = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.deploymentId, DEPLOYMENT));
  const orderIds = mine.map((o) => o.id);

  if (orderIds.length) {
    await db.delete(mealSelections).where(inArray(mealSelections.orderId, orderIds));
    await db.delete(deliveries).where(inArray(deliveries.orderId, orderIds));
    await db.delete(orders).where(inArray(orders.id, orderIds));
  }

  const weeks = await db
    .select({ id: menuWeeks.id })
    .from(menuWeeks)
    .where(eq(menuWeeks.weekStart, MONDAY));
  if (weeks.length) {
    const weekIds = weeks.map((w) => w.id);
    await db.delete(menuItems).where(inArray(menuItems.menuWeekId, weekIds));
    await db.delete(menuWeeks).where(inArray(menuWeeks.id, weekIds));
  }

  await db.delete(dishes).where(like(dishes.name, `${DISH_PREFIX}%`));
  await db.delete(users).where(like(users.email, `${USER_PREFIX}%@test.invalid`));
}

describe("dailyLabelSheet (integration)", () => {
  beforeEach(async () => {
    await reset();
    const snap = await loadCatalogSnapshot();
    mealSizeId = snap.mealSizes[0].id;

    const [u] = await db
      .insert(users)
      .values({
        email: `${USER_PREFIX}${Math.random().toString(36).slice(2)}@test.invalid`,
        phone: "+16475557001",
        role: "user",
        deliveryNotes: "Buzz 1185",
      })
      .returning();

    const [o] = await db
      .insert(orders)
      .values({
        userId: u.id,
        planId: snap.plans.find((p) => p.key === "veg")!.id,
        mealSizeId,
        frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id,
        persons: 1,
        mealSlots: ["lunch"],
        categoryCounts: { sabzi: 2 },
        durationWeeks: 1,
        startDate: MONDAY,
        tiffinCount: 5,
        perTiffinPrice: "10.00",
        pricingSnapshot: {},
        total: "50.00",
        status: "active",
        deploymentId: DEPLOYMENT,
        fullName: "Label Tester",
        addressLine: "1 Queen St",
        city: "Toronto",
        postalCode: "M5V 2T6",
      })
      .returning();
    order = o;

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

    const [paneer] = await db.insert(dishes).values({ name: `${DISH_PREFIX}Paneer` }).returning();
    await attachDishToPlans(paneer.id);
    const [bhindi] = await db.insert(dishes).values({ name: `${DISH_PREFIX}Bhindi` }).returning();
    await attachDishToPlans(bhindi.id);
    paneerId = paneer.id;
    bhindiPublicId = bhindi.publicId;

    const sabzi = await categoryIdFor("sabzi");
    await db.insert(menuItems).values({
      menuWeekId: w.id, dayOfWeek: "mon", categoryId: sabzi, dishId: paneer.id, isDefault: true,
    });
    await db.insert(menuItems).values({
      menuWeekId: w.id, dayOfWeek: "mon", categoryId: sabzi, dishId: bhindi.id, isDefault: false,
    });

    // Two sabzi containers at different sizes — the shape that makes pickIndex → portion
    // mapping load-bearing rather than cosmetic.
    await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, mealSizeId));
    await db.insert(mealSizeItems).values([
      { mealSizeId, name: "Main", category: "sabzi", qty: 1, weightValue: "12.00", weightUnit: "oz", sortOrder: 1 },
      { mealSizeId, name: "Side", category: "sabzi", qty: 1, weightValue: "8.00", weightUnit: "oz", sortOrder: 2 },
    ]);
  });
  afterAll(reset);

  it("returns one label per person with the day's resolved dishes", async () => {
    const sheet = await dailyLabelSheet(MONDAY);

    expect(sheet.menuWeekPublicId).toBe(week.publicId);
    expect(sheet.labels).toHaveLength(1);
    const [label] = sheet.labels;
    expect(label.customerName).toBe("Label Tester");
    expect(label.deploymentId).toBe(DEPLOYMENT);
    expect(label.deliveryNotes).toBe("Buzz 1185");
    // categoryCounts sabzi:2 → two containers, both defaulted to the menu default.
    expect(label.lines.map((l) => l.dish)).toEqual([`${DISH_PREFIX}Paneer`, `${DISH_PREFIX}Paneer`]);
    expect(label.lines.every((l) => l.defaulted)).toBe(true);
  });

  it("maps each pick to its own container size", async () => {
    const [label] = (await dailyLabelSheet(MONDAY)).labels;
    // 12oz main then 8oz side, by sortOrder — not both at whichever size sorted first.
    expect(label.lines.map((l) => l.portion)).toEqual(["12oz", "8oz"]);
  });

  it("reflects a customer's pick, not just the default", async () => {
    const { selectionsService } = await import("@/lib/menu/selections.service");
    await selectionsService.setSelection({
      order, menuWeek: week, dayOfWeek: "mon", slot: "sabzi",
      personIndex: 1, pickIndex: 2, dishPublicId: bhindiPublicId,
    });

    const [label] = (await dailyLabelSheet(MONDAY)).labels;
    expect(label.lines.map((l) => l.dish)).toEqual([`${DISH_PREFIX}Paneer`, `${DISH_PREFIX}Bhindi`]);
    expect(label.lines.map((l) => l.defaulted)).toEqual([true, false]);
  });

  it("counts containers by dish AND size, the way the kitchen cooks", async () => {
    const sheet = await dailyLabelSheet(MONDAY);
    expect(sheet.counts).toEqual([
      expect.objectContaining({ dish: `${DISH_PREFIX}Paneer`, portion: "12oz", count: 1 }),
      expect.objectContaining({ dish: `${DISH_PREFIX}Paneer`, portion: "8oz", count: 1 }),
    ]);
  });

  it("prints a label per person on a multi-person order", async () => {
    await db.update(orders).set({ persons: 2 }).where(eq(orders.id, order.id));
    const sheet = await dailyLabelSheet(MONDAY);
    expect(sheet.labels).toHaveLength(2);
    expect(sheet.labels.map((l) => l.personIndex)).toEqual([1, 2]);
    // 2 people x 2 sabzi containers.
    expect(sheet.counts.reduce((n, c) => n + c.count, 0)).toBe(4);
  });

  it("excludes deliveries that are not scheduled", async () => {
    await db.update(deliveries).set({ status: "skipped" }).where(eq(deliveries.orderId, order.id));
    const sheet = await dailyLabelSheet(MONDAY);
    expect(sheet.labels).toEqual([]);
    expect(sheet.counts).toEqual([]);
  });

  it("resolves nothing when the week is not released, rather than guessing a menu", async () => {
    await db.update(menuWeeks).set({ status: "draft" }).where(eq(menuWeeks.id, week.id));
    const sheet = await dailyLabelSheet(MONDAY);
    expect(sheet.menuWeekPublicId).toBeNull();
    expect(sheet.labels).toEqual([]);
  });

  it("is empty for a day with no deliveries", async () => {
    const other = new Date(`${MONDAY}T00:00:00.000Z`);
    other.setUTCDate(other.getUTCDate() + 1);
    const sheet = await dailyLabelSheet(other.toISOString().slice(0, 10));
    expect(sheet.labels).toEqual([]);
  });

  it("keeps the dish list identical to what the customer's own resolution returns", async () => {
    const { resolveDeliveryMeal } = await import("@/lib/menu/resolve-delivery-meal");
    const resolved = await resolveDeliveryMeal(order, week, "mon", 1, null);
    const expected = resolved.flatMap((c) => c.picks.map((p) => p.name));

    const [label] = (await dailyLabelSheet(MONDAY)).labels;
    expect(label.lines.map((l) => l.dish)).toEqual(expected);
    expect(paneerId).toBeDefined();
  });
});
