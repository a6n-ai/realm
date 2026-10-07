import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, notificationOutbox, orderActivities, orders, payments } = await import("@/db/schema");
const { grantComplimentaryTiffin, maybeComplete } = await import("../deliveries.service");
const { orderTiffinCounts } = await import("../customer-deliveries.service");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "comp-test-1";
const DEP2 = "comp-test-2";
const PREFIX = "cmpa";
const PREFIX2 = "cmpb";
const NEXT_MON = "2030-01-14";

async function reset() {
  await db.delete(notificationOutbox).where(eq(notificationOutbox.event, "order_complimentary"));
  await resetTrips(DEP2, PREFIX2);
  await resetTrips(DEP, PREFIX);
}

describe("grantComplimentaryTiffin", () => {
  beforeEach(reset);
  afterAll(reset);

  it("adds one free delivery on the chosen day without touching the paid count", async () => {
    const { order } = await makeTripOrder(DEP, PREFIX);
    const { reopened } = await grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: " Missed Jan 3 ", notify: false }, null);
    expect(reopened).toBe(false);

    const [row] = await db.select().from(deliveries).where(and(eq(deliveries.orderId, order.id), eq(deliveries.deliveryDate, NEXT_MON)));
    expect(row).toMatchObject({ status: "scheduled", tiffinUnits: 1, coversDates: [NEXT_MON], complimentaryNote: "Missed Jan 3" });
    const [o] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(o).toMatchObject({ tiffinCount: order.tiffinCount, complimentaryTiffins: 1, status: "active" });
    const counts = await orderTiffinCounts(order.publicId);
    expect(counts).toMatchObject({ total: order.tiffinCount + 1, complimentary: 1 });
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, order.id));
    expect(acts.some((a) => a.type === "complimentary_granted" && a.deliveryId === row!.id)).toBe(true);
  });

  it("rejects a day the plan doesn't deliver, a day already taken, and a blank reason", async () => {
    const { order } = await makeTripOrder(DEP, PREFIX);
    await expect(grantComplimentaryTiffin(order.publicId, { date: "2030-01-15", note: "x", notify: false }, null)).rejects.toThrow(/delivery days/);
    await expect(grantComplimentaryTiffin(order.publicId, { date: "2030-01-07", note: "x", notify: false }, null)).rejects.toThrow(/already has a delivery/);
    await expect(grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "  ", notify: false }, null)).rejects.toThrow(/reason/);
  });

  it("reopens a plan that is over, and complete-plans closes it again once the day is past", async () => {
    const { order } = await makeTripOrder(DEP, PREFIX);
    await db.update(orders).set({ status: "completed" }).where(eq(orders.id, order.id));
    const { reopened } = await grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "Sorry", notify: false }, null);
    expect(reopened).toBe(true);
    const [o] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, order.id));
    expect(o!.status).toBe("active");
    // The free day is still ahead, so the nightly sweep must leave the plan open.
    expect(await maybeComplete(order.id)).toBe(false);
  });

  it("refuses a cancelled plan and a day inside the customer's other running plan", async () => {
    const { order } = await makeTripOrder(DEP, PREFIX);
    const { order: other } = await makeTripOrder(DEP2, PREFIX2, 1, "mwf", 2);
    await db.update(orders).set({ userId: order.userId, status: "active" }).where(eq(orders.id, other.id));
    await db.update(orders).set({ status: "completed" }).where(eq(orders.id, order.id));
    await expect(grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "x", notify: false }, null)).rejects.toThrow(/another plan/);

    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, order.id));
    await expect(grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "x", notify: false }, null)).rejects.toThrow(/active plan/);
  });

  it("refuses a plan whose payment is still pending", async () => {
    const { order } = await makeTripOrder(DEP, PREFIX);
    await db.update(payments).set({ status: "pending_verification" }).where(eq(payments.orderId, order.id));
    await expect(grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "x", notify: false }, null)).rejects.toThrow(/Payment is still pending/);
  });

  it("links the free tiffin to one past delivery, once", async () => {
    const { order, wed, fri } = await makeTripOrder(DEP, PREFIX);
    // The fixture's plan is dated 2030; pull Wed into the past so it counts as a delivery that happened.
    await db.update(deliveries).set({ deliveryDate: "2026-01-07" }).where(eq(deliveries.id, wed.id));
    await expect(grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "x", notify: false, forDeliveryPublicId: fri.publicId }, null)).rejects.toThrow(/past delivery/);

    const { deliveryPublicId } = await grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "Driver missed you", notify: false, forDeliveryPublicId: wed.publicId }, null);
    const [row] = await db.select().from(deliveries).where(eq(deliveries.publicId, deliveryPublicId));
    expect(row!.complimentaryForDeliveryId).toBe(wed.id);
    await expect(grantComplimentaryTiffin(order.publicId, { date: "2030-01-16", note: "x", notify: false, forDeliveryPublicId: wed.publicId }, null)).rejects.toThrow(/already has a free tiffin/);
  });

  it("queues the customer notification only when asked", async () => {
    const { order } = await makeTripOrder(DEP, PREFIX);
    const mine = and(eq(notificationOutbox.recipientId, order.userId!), eq(notificationOutbox.event, "order_complimentary"));
    await grantComplimentaryTiffin(order.publicId, { date: NEXT_MON, note: "On us", notify: false }, null);
    expect(await db.select().from(notificationOutbox).where(mine)).toHaveLength(0);
    await grantComplimentaryTiffin(order.publicId, { date: "2030-01-16", note: "On us", notify: true }, null);
    expect((await db.select().from(notificationOutbox).where(mine)).length).toBeGreaterThan(0);
  });
});
