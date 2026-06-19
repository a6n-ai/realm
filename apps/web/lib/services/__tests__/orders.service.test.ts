import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { createOrder } from "../orders.service";

async function reset() {
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users);
}

const baseInput = (mealSizeId: string, planKey: string) => ({
  planKey,
  selections: {
    mealSizeId,
    frequencyKey: "5_day" as const,
    dailyQty: 1,
    includeSaturday: false,
    includeSunday: false,
    isStudent: false,
    durationWeeks: 1,
  },
  contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("createOrder (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("provisions a customer by phone, prices server-side, writes order + payment", async () => {
    const snap = await loadCatalogSnapshot();
    const { deploymentId } = await createOrder(baseInput(snap.mealSizes[0].id, snap.plans[0].key));
    expect(deploymentId).toMatch(/^SUB-/);
    const [u] = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(u.role).toBe("user");
    const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(Number(o.total)).toBeGreaterThan(0);
    const pays = await db.select().from(payments).where(eq(payments.orderId, o.id));
    expect(pays).toHaveLength(1);
  });

  it("reuses an existing customer on a second order with the same phone", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].id, snap.plans[0].key);
    await createOrder(input);
    await createOrder(input);
    const rows = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(rows).toHaveLength(1);
  });
});
