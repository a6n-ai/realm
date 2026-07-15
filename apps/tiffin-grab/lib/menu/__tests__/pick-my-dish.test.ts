import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { NotFoundError, nextWeekday, weekdayKey } from "@realm/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const { db } = await import("@/db/client");
const { deliveries, dishes, ledgerEntries, mealSelections, menuItems, menuWeeks, orderActivities, orders, payments, users } =
  await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("@/lib/services/orders.service");
const { pickMyDish } = await import("@/app/(customer)/me/meals/actions");

const PHONE_A = "+16475550601";
const PHONE_B = "+16475550602";

async function reset() {
  await db.delete(mealSelections);
  await db.delete(menuItems);
  await db.delete(menuWeeks);
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(dishes).where(eq(dishes.name, "TEST_MEAL_DISH"));
  await db.delete(users).where(ne(users.isSystem, true));
}

// Mirrors the (customer)/me/deliveries harness: a real order via createOrder,
// so a materialized `deliveries` row with a future cutoffAt exists to pick against.
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
    contact: { fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
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

// A released week + "sabzi" (selectable) menu item on the order's first delivery date.
async function seedMenu(deliveryDateIso: string) {
  const d = new Date(`${deliveryDateIso}T00:00:00.000Z`);
  const dayOfWeek = weekdayKey(d);
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const weekStart = monday.toISOString().slice(0, 10);

  const [week] = await db.insert(menuWeeks).values({ weekStart, status: "released", orderCutoff: new Date("2999-01-01").getTime() }).returning();
  const [dish] = await db.insert(dishes).values({ name: "TEST_MEAL_DISH", diet: "veg" }).returning();
  await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek, slot: "sabzi", dishId: dish.id, isDefault: true });
  return { week, dish, dayOfWeek };
}

describe("(customer)/me/meals pickMyDish (integration)", () => {
  beforeEach(async () => {
    await reset();
    session.user = null;
  });
  afterAll(reset);

  it("lets the owner pick a valid dish", async () => {
    const order = await makeOrder(PHONE_A, "User A");
    const owner = await userIdOf(order);
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    const { week, dish, dayOfWeek } = await seedMenu(delivery.deliveryDate);

    actAs(owner.publicId);
    await pickMyDish({
      orderId: order.publicId,
      menuWeekId: week.publicId,
      dayOfWeek,
      slot: "sabzi",
      personIndex: 1,
      pickIndex: 1,
      dishId: dish.publicId,
    });

    const [row] = await db
      .select()
      .from(mealSelections)
      .where(eq(mealSelections.orderId, order.id));
    expect(row).toBeTruthy();
    expect(row.menuWeekId).toBe(week.id);
    expect(row.dayOfWeek).toBe(dayOfWeek);
    expect(row.slot).toBe("sabzi");
    expect(row.personIndex).toBe(1);
    expect(row.pickIndex).toBe(1);
    expect(row.dishId).toBe(dish.id);
  });

  it("rejects a non-owner picking on another user's order with NotFoundError", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const a = await userIdOf(aOrder);
    const [bDelivery] = await db.select().from(deliveries).where(eq(deliveries.orderId, bOrder.id));
    const { week, dish, dayOfWeek } = await seedMenu(bDelivery.deliveryDate);

    actAs(a.publicId);
    await expect(
      pickMyDish({
        orderId: bOrder.publicId,
        menuWeekId: week.publicId,
        dayOfWeek,
        slot: "sabzi",
        personIndex: 1,
        pickIndex: 1,
        dishId: dish.publicId,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const rows = await db.select().from(mealSelections).where(eq(mealSelections.orderId, bOrder.id));
    expect(rows.length).toBe(0);
  });
});
