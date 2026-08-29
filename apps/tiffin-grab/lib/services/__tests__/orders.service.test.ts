import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { ValidationError, nextWeekday } from "@realm/commons";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, orderActivities, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createOrder } = await import("../orders.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
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
  contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
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
    // A zone-matched order lands on "active" directly (createOrder never calls
    // activate()) and must materialize its N delivery rows in the same tx.
    expect(o.status).toBe("active");
    const drops = await db.select().from(deliveries).where(eq(deliveries.orderId, o.id));
    expect(drops.length).toBe(o.durationWeeks * 5); // 5_day frequency
    expect(drops.every((d) => d.status === "scheduled" && d.makeupForDeliveryId === null)).toBe(true);
  });

  it("seeds the activity timeline with a created row matching the initial status", async () => {
    const snap = await loadCatalogSnapshot();
    const { deploymentId } = await createOrder(baseInput(snap.mealSizes[0].publicId, snap.plans[0].key));
    const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const acts = await db.select().from(orderActivities).where(eq(orderActivities.orderId, o.id));
    expect(acts).toHaveLength(1);
    expect(acts[0].type).toBe("created");
    expect(acts[0].toStatus).toBe(o.status);
  });

  it("reuses an existing customer on a second order with the same phone", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    await createOrder(input);
    // Second order for the same phone needs a non-overlapping window — the
    // guard under test here is customer dedup by phone, not the overlap rule.
    const secondStart = nextWeekday(new Date());
    secondStart.setUTCDate(secondStart.getUTCDate() + input.selections.durationWeeks * 7);
    await createOrder({
      ...input,
      selections: { ...input.selections, startDate: secondStart.toISOString().slice(0, 10) },
    });
    const rows = await db.select().from(users).where(eq(users.phone, "+16475550111"));
    expect(rows).toHaveLength(1);
  });

  // A returning customer who checks out logged-out and types a different number
  // must still be recognised, or the overlap guard runs against a brand-new
  // account and happily double-books the same calendar days.
  it("recognises a logged-out returning customer by email when the phone differs", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    await createOrder(input);

    // Same person, same email, second phone number, overlapping window.
    await expect(
      createOrder({
        ...input,
        contact: { ...input.contact, phone: "+16475550999" },
      }),
    ).rejects.toThrow(/already have a plan running/);

    // And no second account was minted for the new number.
    const rows = await db.select().from(users).where(eq(users.email, input.contact.email));
    expect(rows).toHaveLength(1);
  });

  it("attaches a non-overlapping order to the matched account rather than a new one", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    await createOrder(input);

    const laterStart = nextWeekday(new Date());
    laterStart.setUTCDate(laterStart.getUTCDate() + input.selections.durationWeeks * 7);
    const { deploymentId } = await createOrder({
      ...input,
      contact: { ...input.contact, phone: "+16475550999" },
      selections: { ...input.selections, startDate: laterStart.toISOString().slice(0, 10) },
    });

    const [matched] = await db.select().from(users).where(eq(users.email, input.contact.email));
    const [o] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(o.userId).toBe(matched.id);
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

  it("allows a second live plan when ownerUserId is set (customer checkout)", async () => {
    const snap = await loadCatalogSnapshot();
    const [owner] = await db.insert(users).values({ email: "two-plan@x.com", role: "user" }).returning();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    await createOrder(input, { ownerUserId: owner.publicId });
    // Second plan needs a non-overlapping window — this test's subject is that a
    // customer CAN carry two concurrent plans at all, not that windows may overlap.
    const secondStart = nextWeekday(new Date());
    secondStart.setUTCDate(secondStart.getUTCDate() + input.selections.durationWeeks * 7);
    const secondInput = { ...input, selections: { ...input.selections, startDate: secondStart.toISOString().slice(0, 10) } };
    await expect(createOrder(secondInput, { ownerUserId: owner.publicId })).resolves.toMatchObject({
      publicId: expect.stringMatching(/^ord_/),
    });
    const rows = await db.select().from(orders).where(eq(orders.userId, owner.id));
    expect(rows).toHaveLength(2);
  });

  it("rejects a malformed phone", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    input.contact.phone = "12";
    await expect(createOrder(input)).rejects.toBeInstanceOf(ValidationError);
  });

  it("stores order phone as E.164 on the user row", async () => {
    const snap = await loadCatalogSnapshot();
    const input = baseInput(snap.mealSizes[0].publicId, snap.plans[0].key);
    input.contact.phone = "647 555 0100";
    const { deploymentId } = await createOrder(input);
    const [u] = await db.select().from(users).where(eq(users.phone, "+16475550100"));
    expect(u).toBeDefined();
    expect(u.phone).toBe("+16475550100");
  });
});
