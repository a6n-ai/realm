import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError, nextWeekday } from "@tiffin/commons";
import { db } from "@/db/client";
import { orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createOrder } = await import("../orders.service");

async function reset() {
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users);
}

const baseInput = (mealSizePublicId: string, planKey: string) => ({
  planKey,
  selections: {
    mealSizeId: mealSizePublicId,
    frequencyKey: "5_day" as const,
    persons: 1,
    mealSlots: ["lunch"],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: 1,
    startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
  },
  contact: { fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
});

describe("createOrder (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("provisions a customer by phone, prices server-side, writes order + payment", async () => {
    const snap = await loadCatalogSnapshot();
    const { deploymentId, publicId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    expect(deploymentId).toMatch(/^SUB-/);
    expect(publicId).toMatch(/^ord_/);
    const [u] = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(u.role).toBe("user");
    const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(o.publicId).toBe(publicId);
    expect(Number(o.total)).toBeGreaterThan(0);
    expect(o.tiffinCount).toBeGreaterThan(0);
    expect(Number.isInteger(o.tiffinCount)).toBe(true);
    expect(Number(o.perTiffinPrice)).toBeGreaterThan(0);
    expect(Number(o.total)).toBeCloseTo(Number(o.perTiffinPrice) * o.tiffinCount, 2);
    const pays = await db.select().from(payments).where(eq(payments.orderId, o.id));
    expect(pays).toHaveLength(1);
  });

  it("reuses an existing customer on a second order with the same phone", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    await createOrder(input);
    await createOrder(input);
    const rows = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(rows).toHaveLength(1);
  });

  it("attaches to ownerUserId without provisioning by phone", async () => {
    const snap = await loadCatalogSnapshot();
    const [owner] = await db.insert(users).values({ email: "owner@x.com", role: "user" }).returning();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    const { deploymentId } = await createOrder(input, { ownerUserId: owner.publicId });
    const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(o.userId).toBe(owner.id);
    // No customer provisioned for the typed phone.
    const phoned = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(phoned).toHaveLength(0);
  });

  it("rejects a malformed phone", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    input.contact.phone = "12";
    await expect(createOrder(input)).rejects.toBeInstanceOf(ValidationError);
  });
});
