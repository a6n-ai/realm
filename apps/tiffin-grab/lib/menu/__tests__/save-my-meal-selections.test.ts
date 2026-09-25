import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday, weekdayKey } from "@foundry/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { db } = await import("@/db/client");
const { deliveries, dishes, ledgerEntries, mealSelections, menuItems, menuWeeks, orderActivities, orders, payments, users } =
  await import("@/db/schema");
const { attachDishToPlans, categoryIdFor, testPlanId } = await import("@/db/test-helpers");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("@/lib/services/orders.service");
const { saveMyMealSelections } = await import("@/app/(customer)/me/meals/actions");

const PHONE_A = "+16475550611";
const PHONE_B = "+16475550612";

async function reset() {
  await db.delete(mealSelections);
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(dishes).where(eq(dishes.name, "TEST_BATCH_DISH_1"));
  await db.delete(dishes).where(eq(dishes.name, "TEST_BATCH_DISH_2"));
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder(phone: string, fullName: string) {
  const snap = await loadCatalogSnapshot();
  const mealSize = snap.mealSizes.find((m) => m.planKey === "veg")!;
  const { publicId } = await createOrder({
    planKey: "veg",
    selections: {
      mealSizeId: mealSize.publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function userIdOf(order: { id: bigint }) {
  const [u] = await db
    .select({ id: users.id, publicId: users.publicId })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, order.id));
  return u;
}

function actAs(publicId: string) {
  session.user = { id: publicId, role: "user" };
}

async function seedMenu(deliveryDateIso: string) {
  const d = new Date(`${deliveryDateIso}T00:00:00.000Z`);
  const dayOfWeek = weekdayKey(d);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);

  const [week] = await db.insert(menuWeeks).values({ weekStart, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
  const [dish1] = await db.insert(dishes).values({ planId: await testPlanId(), name: "TEST_BATCH_DISH_1", category: "sabzi" }).returning();
  const [dish2] = await db.insert(dishes).values({ planId: await testPlanId(), name: "TEST_BATCH_DISH_2", category: "sabzi" }).returning();
  await attachDishToPlans(dish1.id);
  await attachDishToPlans(dish2.id);

  const catId = await categoryIdFor("sabzi");
  await db.insert(menuItems).values([
    { menuWeekId: week.id, dayOfWeek, categoryId: catId, dishId: dish1.id, isDefault: true },
    { menuWeekId: week.id, dayOfWeek, categoryId: catId, dishId: dish2.id, isDefault: false },
  ]);
  return { week, dish1, dish2, dayOfWeek };
}

describe("(customer)/me/meals saveMyMealSelections (integration)", () => {
  beforeEach(async () => {
    await reset();
    session.user = null;
  });
  afterAll(reset);

  it("batch saves meal selections for the owner", async () => {
    const order = await makeOrder(PHONE_A, "Batch User");
    const owner = await userIdOf(order);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    const { week, dish2, dayOfWeek } = await seedMenu(delivery.deliveryDate);

    actAs(owner.publicId);
    const result = await saveMyMealSelections({
      orderId: order.publicId,
      picks: [
        {
          menuWeekId: week.publicId,
          dayOfWeek,
          slot: "sabzi",
          personIndex: 1,
          pickIndex: 1,
          dishId: dish2.publicId,
        },
      ],
    });

    expect(result).toEqual({ ok: true, saved: 1 });

    const [row] = await db
      .select()
      .from(mealSelections)
      .where(eq(mealSelections.orderId, order.id));
    expect(row).toBeTruthy();
    expect(row.menuWeekId).toBe(week.id);
    expect(row.dayOfWeek).toBe(dayOfWeek);
    expect(row.categoryId).toBe(await categoryIdFor("sabzi"));
    expect(row.dishId).toBe(dish2.id);
  });

  it("handles empty picks without error", async () => {
    const order = await makeOrder(PHONE_A, "Batch User");
    const owner = await userIdOf(order);
    actAs(owner.publicId);

    const result = await saveMyMealSelections({
      orderId: order.publicId,
      picks: [],
    });
    expect(result).toEqual({ ok: true, saved: 0 });
  });

  it("rejects non-owner trying to batch save on another user's order", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const a = await userIdOf(aOrder);
    const [bDelivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, bOrder.id));
    const { week, dish2, dayOfWeek } = await seedMenu(bDelivery.deliveryDate);

    actAs(a.publicId);
    const result = await saveMyMealSelections({
      orderId: bOrder.publicId,
      picks: [
        {
          menuWeekId: week.publicId,
          dayOfWeek,
          slot: "sabzi",
          personIndex: 1,
          pickIndex: 1,
          dishId: dish2.publicId,
        },
      ],
    });

    expect(result).toEqual({ error: "Subscription not found" });
    const rows = await db.select().from(mealSelections).where(eq(mealSelections.orderId, bOrder.id));
    expect(rows.length).toBe(0);
  });
});
