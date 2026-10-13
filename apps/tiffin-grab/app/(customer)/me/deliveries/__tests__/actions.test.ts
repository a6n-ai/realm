import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { desc, eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

const session: { user: { id: string; role: string } | null } = { user: null };
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (session.user ? session : null) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
// Saving an address geocodes it; tests must not call AWS.
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));

const { db } = await import("@/db/client");
const { customerAddresses, deliveries, ledgerEntries, orderActivities, orders, payments, subscriptionPauses, users } = await import("@/db/schema");
const { pauseDays } = await import("@/lib/services/pause-days.service");
const { addressService } = await import("@/lib/services/addresses.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("@/lib/services/orders.service");
const {
  setMyDeliveryAddress,
  clearMyDeliveryAddress,
  loadMyPauseDays,
  pauseMyDays,
  releaseMyDays,
  rescheduleMyDelivery,
} = await import("../actions");

const PHONE_A = "+16475550401";
const PHONE_B = "+16475550402";

async function reset() {
  await db.delete(subscriptionPauses);
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
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
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName, phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [o] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  return o;
}

async function firstDeliveryOf(order: { id: bigint }) {
  const [row] = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
  return row;
}

function actAs(publicId: string) {
  session.user = { id: publicId, role: "user" };
}

const ADDR = { fullName: "New Name", addressLine: "2 Ave", city: "Toronto", postalCode: "M5V 2T6" };

describe("(customer)/me/deliveries actions (integration)", () => {
  beforeEach(async () => {
    await reset();
    session.user = null;
  });
  afterAll(reset);

  it("rejects moving another user's delivery with a NotFoundError message, no state change", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const bDelivery = await firstDeliveryOf(bOrder);

    actAs(userA.publicId);
    // Returned, not thrown: a thrown error across a Server Action boundary gets
    // redacted to a message-less "Minified React error #441" in production
    // builds (see app/(customer)/me/action-result.ts) — expected rejections must
    // come back as { error } so the customer actually sees why.
    await expect(rescheduleMyDelivery(bDelivery.publicId, "2030-01-07")).resolves.toEqual({ error: expect.any(String) });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, bDelivery.id));
    expect(row.status).toBe("scheduled"); // untouched — guard ran before the mutation
  });

  it("rejects re-addressing another user's delivery", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const bDelivery = await firstDeliveryOf(bOrder);

    actAs(userA.publicId);
    await expect(setMyDeliveryAddress(bDelivery.publicId, { newAddress: ADDR })).resolves.toEqual({ error: expect.any(String) });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, bDelivery.id));
    expect(row.fullName).not.toBe(ADDR.fullName);
  });

  it("rejects clearing another user's delivery address", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const bDelivery = await firstDeliveryOf(bOrder);

    actAs(userA.publicId);
    await expect(clearMyDeliveryAddress(bDelivery.publicId)).resolves.toEqual({ error: expect.any(String) });
  });

  // A real day on B's plan with a far-off cutoff: the ownership check is the only thing that can refuse it.
  async function realDay(order: { id: bigint }) {
    const rows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id)).orderBy(desc(deliveries.deliveryDate));
    const row = rows[0]!;
    await db.update(deliveries).set({ cutoffAt: Date.now() + 1e9 }).where(eq(deliveries.id, row.id));
    return row;
  }
  const ownerOf = async (order: { id: bigint }) => (await db.select({ id: users.id, publicId: users.publicId }).from(orders)
    .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, order.id)))[0]!;
  const statusOf = async (id: bigint) => (await db.select().from(deliveries).where(eq(deliveries.id, id)))[0]!.status;

  it("rejects pausing a real day on another user's subscription, no state change", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const day = await realDay(bOrder);

    actAs((await ownerOf(aOrder)).publicId);
    await expect(pauseMyDays(bOrder.publicId, [day.deliveryDate])).resolves.toEqual({ error: expect.any(String) });
    expect(await statusOf(day.id)).toBe("scheduled");
    expect(await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, bOrder.id))).toHaveLength(0);

    actAs((await ownerOf(bOrder)).publicId);
    await expect(pauseMyDays(bOrder.publicId, [day.deliveryDate])).resolves.not.toHaveProperty("error");
    expect(await statusOf(day.id)).toBe("paused");
  });

  it("rejects resuming, and listing, a day the other user really paused", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const bOrder = await makeOrder(PHONE_B, "User B");
    const day = await realDay(bOrder);
    await pauseDays(bOrder.publicId, [day.deliveryDate], null);

    actAs((await ownerOf(aOrder)).publicId);
    await expect(releaseMyDays(bOrder.publicId, [day.deliveryDate])).resolves.toEqual({ error: expect.any(String) });
    await expect(releaseMyDays(bOrder.publicId, "all")).resolves.toEqual({ error: expect.any(String) });
    await expect(loadMyPauseDays(bOrder.publicId)).resolves.toEqual({ error: expect.any(String) });
    expect(await statusOf(day.id)).toBe("paused");

    actAs((await ownerOf(bOrder)).publicId);
    await expect(loadMyPauseDays(bOrder.publicId)).resolves.toMatchObject({ days: expect.arrayContaining([{ date: day.deliveryDate, paused: true }]) });
    await expect(releaseMyDays(bOrder.publicId, [day.deliveryDate])).resolves.not.toHaveProperty("error");
    expect(await statusOf(day.id)).toBe("scheduled");
  });

  it("staff can pause and resume a customer's days, and the activity names the staff member", async () => {
    const bOrder = await makeOrder(PHONE_B, "User B");
    const day = await realDay(bOrder);
    const [admin] = await db.insert(users).values({ email: `admin${Math.random().toString(36).slice(2)}@test.invalid`, phone: "+16475550499", role: "admin" }).returning();

    session.user = { id: admin.publicId, role: "admin" };
    await expect(pauseMyDays(bOrder.publicId, [day.deliveryDate])).resolves.not.toHaveProperty("error");
    expect(await statusOf(day.id)).toBe("paused");
    await expect(releaseMyDays(bOrder.publicId, "all")).resolves.not.toHaveProperty("error");
    expect(await statusOf(day.id)).toBe("scheduled");
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, bOrder.id));
    expect(acts.filter((a) => a.type === "paused" || a.type === "resumed").map((a) => a.createdBy)).toEqual([admin.id, admin.id]);
  });

  it("surfaces the cutoff gate when moving a past delivery", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const aPastDelivery = await firstDeliveryOf(aOrder);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 1000 }).where(eq(deliveries.id, aPastDelivery.id));

    actAs(userA.publicId);
    await expect(rescheduleMyDelivery(aPastDelivery.publicId, "2030-01-07")).resolves.toEqual({ error: expect.any(String) });
  });

  it("owner moves one delivery to a saved address; nothing is charged", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const work = await addressService.create({ userId: userA.id, orgId: null }, { label: "Work", addressLine: "200 Bay St", city: "Toronto", postalCode: "M5J 2J1" });
    const d = await firstDeliveryOf(aOrder);

    actAs(userA.publicId);
    await expect(setMyDeliveryAddress(d.publicId, { addressPublicId: work.publicId })).resolves.toEqual({ ok: true });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.addressId).toBe(work.id);
    expect(row.addressLine).toBe("200 Bay St");
    const [after] = await db.select().from(orders).where(eq(orders.id, aOrder.id));
    expect(after.total).toBe(aOrder.total);
  });

  it("owner enters a new address for one delivery; it is saved to their book", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const d = await firstDeliveryOf(aOrder);

    actAs(userA.publicId);
    await setMyDeliveryAddress(d.publicId, { newAddress: { addressLine: "5 Queen St", city: "Toronto", postalCode: "M5V 2T6" } });
    const book = await db.select().from(customerAddresses).where(eq(customerAddresses.userId, userA.id));
    const added = book.find((a) => a.addressLine === "5 Queen St");
    expect(added).toBeDefined();
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.addressId).toBe(added!.id);
  });

  it("refuses to re-address a delivery past its cutoff", async () => {
    const aOrder = await makeOrder(PHONE_A, "User A");
    const [userA] = await db.select({ id: users.id, publicId: users.publicId }).from(orders)
      .innerJoin(users, eq(orders.userId, users.id)).where(eq(orders.id, aOrder.id));
    const d = await firstDeliveryOf(aOrder);
    await db.update(deliveries).set({ cutoffAt: Date.now() - 60_000 }).where(eq(deliveries.id, d.id));

    actAs(userA.publicId);
    await expect(setMyDeliveryAddress(d.publicId, { newAddress: { addressLine: "5 Queen St", city: "Toronto", postalCode: "M5V 2T6" } }))
      .resolves.toEqual({ error: expect.stringMatching(/cutoff/i) });
    const [row] = await db.select().from(deliveries).where(eq(deliveries.id, d.id));
    expect(row.addressLine).toBeNull();
  });
});
