import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday, NotFoundError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, dishes, ledgerEntries, mealSelections, menuItems, menuWeeks, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder, cancelOrder } = await import("../orders.service");
const {
  assertOwnsDelivery,
  assertOwnsOrder,
  myActiveSubscriptions,
  myCalendar,
  myDeliveries,
  myPausePanel,
  myPrimarySubscription,
} = await import("../customer-deliveries.service");

// Wide enough to bracket any real nextWeekday()-derived delivery date, regardless of "today".
const FROM = "2000-01-01";
const UNTIL = "2100-12-31";

async function reset() {
  await db.delete(mealSelections);
  await db.delete(menuItems);
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(menuWeeks);
  await db.delete(dishes);
  await db.delete(users).where(ne(users.isSystem, true));
}

// M5V is a seeded Toronto zone -> lands "active" with materialized rows.
async function makeOrder(phone: string, fullName: string) {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
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

async function firstDeliveryOf(order: { id: bigint }) {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
  return row;
}

async function userIdByPhone(phone: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
  return row.id;
}

const PHONE_A = "+16475550301";
const PHONE_B = "+16475550302";

describe("customer-deliveries.service (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("myDeliveries unions a user's subscriptions, date-ordered, tagged by order", async () => {
    const aOrder1 = await makeOrder(PHONE_A, "User A");
    const aOrder2 = await makeOrder(PHONE_A, "User A"); // same phone -> same user, second active order
    await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);

    const rows = await myDeliveries(userA, FROM, UNTIL);
    expect(rows.every((r) => r.orderPublicId)).toBe(true);
    expect(new Set(rows.map((r) => r.orderPublicId))).toEqual(new Set([aOrder1.publicId, aOrder2.publicId]));
    const dates = rows.map((r) => r.deliveryDate);
    expect(dates).toEqual([...dates].sort());
  });

  it("myActiveSubscriptions returns only the caller's active/paused orders", async () => {
    const aOrder1 = await makeOrder(PHONE_A, "User A");
    const aOrder2 = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    await cancelOrder(bOrder.publicId); // cancelled, and would also fail the userId scoping check
    const userA = await userIdByPhone(PHONE_A);

    const subs = await myActiveSubscriptions(userA);
    expect(new Set(subs.map((s) => s.publicId))).toEqual(new Set([aOrder1.publicId, aOrder2.publicId]));
    expect(subs.every((s) => ["active", "paused"].includes(s.status))).toBe(true);
    expect(subs.every((s) => typeof s.mealSizeName === "string" && s.mealSizeName.length > 0)).toBe(true);
    expect(subs.every((s) => s.persons >= 1 && typeof s.categoryCounts === "object")).toBe(true);
  });

  it("myPrimarySubscription prefers the newest active plan", async () => {
    const aOrder1 = await makeOrder(PHONE_A, "User A");
    const aOrder2 = await makeOrder(PHONE_A, "User A");
    const userA = await userIdByPhone(PHONE_A);

    const primary = await myPrimarySubscription(userA);
    expect(primary?.publicId).toBe(aOrder2.publicId);

    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, aOrder2.id));
    const afterPause = await myPrimarySubscription(userA);
    expect(afterPause?.publicId).toBe(aOrder1.publicId);
  });

  it("never returns another user's deliveries", async () => {
    await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);

    const rows = await myDeliveries(userA, FROM, UNTIL);
    expect(rows.some((r) => r.orderPublicId === bOrder.publicId)).toBe(false);
  });

  it("excludes cancelled orders and cancelled deliveries", async () => {
    await makeOrder(PHONE_A, "User A");
    const aSecondOrder = await makeOrder(PHONE_A, "User A");
    const userA = await userIdByPhone(PHONE_A);

    await cancelOrder(aSecondOrder.publicId); // marks rows cancelled

    const rows = await myDeliveries(userA, FROM, UNTIL);
    expect(rows.some((r) => r.orderPublicId === aSecondOrder.publicId)).toBe(false);
  });

  it("assertOwnsDelivery throws NotFoundError for another user's delivery", async () => {
    await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);
    const bDelivery = await firstDeliveryOf(bOrder);

    await expect(assertOwnsDelivery(userA, bDelivery.publicId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assertOwnsDelivery resolves for the owner", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const userA = await userIdByPhone(PHONE_A);
    const aDelivery = await firstDeliveryOf(aOrder);

    await expect(assertOwnsDelivery(userA, aDelivery.publicId)).resolves.toBeUndefined();
  });

  it("assertOwnsDelivery throws NotFoundError for a non-existent public id", async () => {
    await makeOrder(PHONE_A, "User A");
    const userA = await userIdByPhone(PHONE_A);

    await expect(assertOwnsDelivery(userA, "dlv_doesnotexist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("assertOwnsOrder throws NotFoundError for another user's order and resolves for the owner", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);

    await expect(assertOwnsOrder(userA, bOrder.publicId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(assertOwnsOrder(userA, aOrder.publicId)).resolves.toBeUndefined();
    await expect(assertOwnsOrder(userA, "ord_doesnotexist")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("myPausePanel returns limits+usage for the owner, and IDOR-blocks another user", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const userA = await userIdByPhone(PHONE_A);

    const panel = await myPausePanel(userA, aOrder.publicId);
    expect(panel.usage).toEqual({ count: 0, daysUsed: 0, hasOpenPause: false });
    expect(panel.limits).toHaveProperty("maxPauses");
    expect(panel.limits).toHaveProperty("maxPauseDaysTotal");
    expect(panel.limits).toHaveProperty("maxPauseStretchDays");

    await expect(myPausePanel(userA, bOrder.publicId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("myCalendar (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  // Far-future Mondays so this suite never collides with makeOrder's nextWeekday()-derived
  // dates or with a real "today" — every date here is a deliberate, deterministic fixture.
  const THIS_MONDAY = (() => {
    const d = new Date(Date.now() + 30 * 86400000);
    d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
    return d.toISOString().slice(0, 10);
  })();
  const addDays = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };
  const TUE_THIS = addDays(THIS_MONDAY, 1);
  const NEXT_MONDAY = addDays(THIS_MONDAY, 7);
  const TUE_NEXT = addDays(NEXT_MONDAY, 1);

  async function seedOrder(phone: string) {
    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.key === "veg")!;
    const [u] = await db.insert(users).values({ phone, role: "user" }).returning();
    const [order] = await db.insert(orders).values({
      userId: u.id, planId: plan.id, mealSizeId: snap.mealSizes[0].id,
      frequencyId: snap.frequencies.find((f) => f.key === "5_day")!.id, persons: 1, mealSlots: ["lunch"],
      categoryCounts: { sabzi: 2, rice: 1 },
      durationWeeks: 2, startDate: THIS_MONDAY, tiffinCount: 10, perTiffinPrice: "10.00", pricingSnapshot: {}, total: "100.00", status: "active",
      deploymentId: `SUB-CAL-${phone.slice(-4)}`, fullName: "T", addressLine: "1", city: "Toronto", postalCode: "M5V 2T6",
    }).returning();
    return { userId: u.id, order, plan };
  }

  async function seedThisWeekMenu(planType: "tiffin" | "healthy") {
    const [week] = await db.insert(menuWeeks).values({
      planType, weekStart: THIS_MONDAY, status: "released", orderCutoff: Date.now() + 999_999_999,
    }).returning();
    const [sabziDefault] = await db.insert(dishes).values({ name: "Paneer Sabzi", diet: "veg" }).returning();
    const [sabziAlt] = await db.insert(dishes).values({ name: "Aloo Sabzi", diet: "veg" }).returning();
    const [riceDefault] = await db.insert(dishes).values({ name: "Jeera Rice", diet: "veg" }).returning();
    await db.insert(menuItems).values([
      { menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziDefault.id, isDefault: true },
      { menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", dishId: sabziAlt.id, isDefault: false },
      { menuWeekId: week.id, dayOfWeek: "mon", slot: "rice", dishId: riceDefault.id, isDefault: true },
      { menuWeekId: week.id, dayOfWeek: "tue", slot: "sabzi", dishId: sabziDefault.id, isDefault: true },
      { menuWeekId: week.id, dayOfWeek: "tue", slot: "sabzi", dishId: sabziAlt.id, isDefault: false },
      { menuWeekId: week.id, dayOfWeek: "tue", slot: "rice", dishId: riceDefault.id, isDefault: true },
    ]);
    return { week, sabziDefault, sabziAlt, riceDefault };
  }

  it("returns one cell per delivery day, locked correctly, pick overrides default, and shows unreleased weeks without menu", async () => {
    const { userId, order, plan } = await seedOrder("+16475550401");
    const { week, sabziAlt, riceDefault } = await seedThisWeekMenu(plan.planType);

    // Next week's menu is still draft — its delivery day must not appear at all.
    await db.insert(menuWeeks).values({ planType: plan.planType, weekStart: NEXT_MONDAY, status: "draft", orderCutoff: Date.now() + 999_999_999 });

    await db.insert(deliveries).values([
      { orderId: order.id, deliveryDate: THIS_MONDAY, cutoffAt: Date.now() - 1000 }, // cutoff already passed
      { orderId: order.id, deliveryDate: TUE_THIS, cutoffAt: Date.now() + 999_999_999 },
      { orderId: order.id, deliveryDate: TUE_NEXT, cutoffAt: Date.now() + 999_999_999 },
    ]);

    // Subscriber overrode Monday's sabzi pick away from the default.
    await db.insert(mealSelections).values({
      orderId: order.id, menuWeekId: week.id, dayOfWeek: "mon", slot: "sabzi", personIndex: 1, pickIndex: 1, dishId: sabziAlt.id,
    });

    const cells = await myCalendar(userId, order.publicId, { from: THIS_MONDAY, until: TUE_NEXT });

    expect(cells.map((c) => c.date)).toEqual([THIS_MONDAY, TUE_THIS, TUE_NEXT]);
    expect(cells.filter((c) => c.menuWeekId === week.publicId)).toHaveLength(2);
    const nextWeek = cells.find((c) => c.date === TUE_NEXT)!;
    expect(nextWeek.menuWeekId).toBeNull();
    expect(nextWeek.options).toEqual([]);

    const monday = cells.find((c) => c.date === THIS_MONDAY)!;
    expect(monday.status).toBe("scheduled");
    expect(monday.isMakeup).toBe(false);
    expect(monday.locked).toBe(true); // cutoff already passed
    const mondaySabzi = monday.meal!.find((c) => c.category === "sabzi")!;
    expect(mondaySabzi.picks[0].dishId).toBe(sabziAlt.id); // pick overrides default
    expect(mondaySabzi.picks[0].isDefaulted).toBe(false);
    const mondayRice = monday.meal!.find((c) => c.category === "rice")!;
    expect(mondayRice.picks[0].dishId).toBe(riceDefault.id); // non-selectable -> always default
    expect(monday.options.some((o) => o.category === "sabzi")).toBe(true); // pre-cutoff day has options
    expect(monday.options.some((o) => o.category === "rice")).toBe(false); // rice isn't selectable

    const tuesday = cells.find((c) => c.date === TUE_THIS)!;
    expect(tuesday.locked).toBe(false);
    const tueSabzi = tuesday.meal!.find((c) => c.category === "sabzi")!;
    expect(tueSabzi.picks[0].isDefaulted).toBe(true); // no override -> default fallback
    expect(tuesday.options.length).toBeGreaterThan(0); // pre-cutoff day -> non-empty options
  });

  it("includes a next-week delivery day once that week's menu is released", async () => {
    const { userId, order, plan } = await seedOrder("+16475550402");
    await seedThisWeekMenu(plan.planType);
    const { week: nextWeek, sabziDefault } = await (async () => {
      const [week] = await db.insert(menuWeeks).values({
        planType: plan.planType, weekStart: NEXT_MONDAY, status: "released", orderCutoff: Date.now() + 999_999_999,
      }).returning();
      const [sabziDefault] = await db.insert(dishes).values({ name: "Bhindi Sabzi", diet: "veg" }).returning();
      await db.insert(menuItems).values({ menuWeekId: week.id, dayOfWeek: "tue", slot: "sabzi", dishId: sabziDefault.id, isDefault: true });
      return { week, sabziDefault };
    })();

    await db.insert(deliveries).values([
      { orderId: order.id, deliveryDate: TUE_THIS, cutoffAt: Date.now() + 999_999_999 },
      { orderId: order.id, deliveryDate: TUE_NEXT, cutoffAt: Date.now() + 999_999_999 },
    ]);

    const cells = await myCalendar(userId, order.publicId, { from: THIS_MONDAY, until: TUE_NEXT });

    expect(cells.map((c) => c.date)).toContain(TUE_NEXT);
    const nextTue = cells.find((c) => c.date === TUE_NEXT)!;
    expect(nextTue.meal!.find((c) => c.category === "sabzi")?.picks[0].dishId).toBe(sabziDefault.id);
    void nextWeek;
  });

  it("IDOR-blocks a caller who does not own the order", async () => {
    const { order, plan } = await seedOrder("+16475550403");
    await seedThisWeekMenu(plan.planType);
    await db.insert(deliveries).values({ orderId: order.id, deliveryDate: THIS_MONDAY, cutoffAt: Date.now() + 999_999_999 });
    const { userId: otherUserId } = await seedOrder("+16475550404");

    await expect(myCalendar(otherUserId, order.publicId, { from: THIS_MONDAY, until: TUE_NEXT })).rejects.toBeInstanceOf(NotFoundError);
  });
});
