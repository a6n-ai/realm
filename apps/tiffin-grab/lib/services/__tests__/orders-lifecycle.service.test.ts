import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday, ValidationError } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, deliveries } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder(status: "pending" | "active" | "waitlisted") {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await svc.createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  await db.update(orders).set({ status }).where(eq(orders.publicId, publicId));
  return publicId;
}

describe("order lifecycle (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("activateOrder waitlisted → active and logs activity", async () => {
    const id = await makeOrder("waitlisted");
    await svc.activateOrder(id);
    const [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("active");
    const acts = await svc.listOrderActivities(o.id);
    expect(acts[0].type).toBe("activated");
    expect(acts[0].toStatus).toBe("active");
  });

  it("pauseOrder active → paused, resumeOrder → active", async () => {
    const id = await makeOrder("active");
    // A wide window (order.startDate is computed at runtime as nextWeekday(now)) so every future
    // original — regardless of when the test runs — falls inside it and the order fully pauses.
    await svc.pauseOrder(id, { from: "2000-01-01", until: "2100-01-01" });
    let [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("paused");
    await svc.resumeOrder(id);
    [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("active");
  });

  // Regression: the deliveries-panel order-level Pause range/Resume buttons now call
  // svc.pauseOrder/svc.resumeOrder (the same authority as LifecycleControls) instead of
  // calling deliveries.service directly, so rows and order.status can never disagree.
  it("a full-schedule pause via the single authority flips both every future original row and order.status together, and resume reverts both", async () => {
    const id = await makeOrder("active");
    const [order] = await db.select().from(orders).where(eq(orders.publicId, id));

    await svc.pauseOrder(id, { from: "2000-01-01", until: "2100-01-01" });
    const [pausedOrder] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(pausedOrder.status).toBe("paused");
    const pausedRows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(pausedRows.length).toBeGreaterThan(0);
    expect(pausedRows.every((r) => r.status === "paused")).toBe(true);

    await svc.resumeOrder(id);
    const [resumedOrder] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(resumedOrder.status).toBe("active");
    const resumedRows = await db.select().from(deliveries).where(eq(deliveries.orderId, order.id));
    expect(resumedRows.every((r) => r.status === "scheduled")).toBe(true);
  });

  it("pauseOrder with a window covering none of the order's deliveries leaves it active", async () => {
    const id = await makeOrder("active");
    await svc.pauseOrder(id, { from: "2000-01-01", until: "2000-01-02" });
    const [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("active");
    const acts = await svc.listOrderActivities(o.id);
    expect(acts.every((a) => a.type !== "paused")).toBe(true);
  });

  it("rejects illegal transitions", async () => {
    const pending = await makeOrder("pending");
    await expect(svc.pauseOrder(pending, { from: "2026-07-06", until: "2026-07-10" })).rejects.toBeInstanceOf(ValidationError);
    await expect(svc.resumeOrder(pending)).rejects.toBeInstanceOf(ValidationError);
    const active = await makeOrder("active");
    await expect(svc.pauseOrder(active, { from: "2026-07-10", until: "2026-07-06" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("pauseOrder rejects malformed dates", async () => {
    const id = await makeOrder("active");
    await expect(svc.pauseOrder(id, { from: "2026/07/06", until: "2026-07-10" })).rejects.toThrow("Pause dates must be ISO YYYY-MM-DD");
    await expect(svc.pauseOrder(id, { from: "2026-07-06", until: "2026/07/10" })).rejects.toThrow("Pause dates must be ISO YYYY-MM-DD");
    await expect(svc.pauseOrder(id, { from: "07-06-2026", until: "2026-07-10" })).rejects.toThrow("Pause dates must be ISO YYYY-MM-DD");
  });

  it("cancelOrder works from any non-cancelled status", async () => {
    const id = await makeOrder("active");
    await svc.cancelOrder(id);
    const [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("cancelled");
    const acts = await svc.listOrderActivities(o.id);
    expect(acts[0].type).toBe("cancelled");
    expect(acts[0].toStatus).toBe("cancelled");
  });
});
