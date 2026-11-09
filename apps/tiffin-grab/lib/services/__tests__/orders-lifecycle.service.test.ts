import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { orders, payments, orderActivities, ledgerEntries } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await deleteNonSystemUsers();
}

async function makeOrder(status: "pending" | "active" | "waitlisted", mealSizeId?: string) {
  const snap = await loadCatalogSnapshot();
  const mealSize = mealSizeId ? snap.mealSizes.find((m) => m.publicId === mealSizeId)! : snap.mealSizes[0];
  const { publicId } = await svc.createOrder({
    planKey: mealSize.planKey,
    selections: {
      mealSizeId: mealSize.publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  await db.update(orders).set({ status }).where(eq(orders.publicId, publicId));
  return publicId;
}

describe("order lifecycle (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("activateOrder waitlisted → active and logs activity", async () => {
    const id = await makeOrder("waitlisted");
    await svc.ordersService.activate(id);
    const [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("active");
    const acts = await svc.listOrderActivities(o.id);
    expect(acts[0].type).toBe("activated");
    expect(acts[0].toStatus).toBe("active");
  });

  it("cancelOrder works from any non-cancelled status", async () => {
    const id = await makeOrder("active");
    await svc.ordersService.cancel(id);
    const [o] = await db.select().from(orders).where(eq(orders.publicId, id));
    expect(o.status).toBe("cancelled");
    const acts = await svc.listOrderActivities(o.id);
    expect(acts[0].type).toBe("cancelled");
    expect(acts[0].toStatus).toBe("cancelled");
  });
});
