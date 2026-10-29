import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";

const visible = vi.hoisted(() => ({ ids: "all" as "all" | string[] }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/guards", () => ({ requirePermission: async () => {}, requireStaff: async () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_staff" } }) }));
vi.mock("@/lib/services/orders.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/orders.service")>()),
  resolveSessionVisibleOrgIds: async () => visible.ids,
}));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("@/lib/services/orders.service");
const { estimatePrefill } = await import("../estimate-actions");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function seed() {
  const snap = await loadCatalogSnapshot();
  const o = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 2,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `e${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Esha Estimate", phone: "+16475550881", addressLine: "9 Queen St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  return { publicId: o.publicId, planKey: snap.plans[0].key, mealSizeId: snap.mealSizes[0].publicId };
}

describe("estimatePrefill (integration)", () => {
  beforeEach(async () => {
    visible.ids = "all";
    await reset();
  });
  afterAll(reset);

  it("fills the estimate from the order: customer, plan, size, weeks and address, never a start date", async () => {
    const s = await seed();
    const r = await estimatePrefill(s.publicId);
    if (!("ok" in r)) throw new Error(r.error);
    expect(r.customer).toMatchObject({ fullName: "Esha Estimate" });
    expect(r.prefill).toMatchObject({ planKey: s.planKey, mealSizeId: s.mealSizeId, durationWeeks: 2, addressLine: "9 Queen St", city: "Toronto" });
    expect(r.prefill.startDate).toBeUndefined();
  });

  it("leaves meal size and weeks for staff to pick on a trial", async () => {
    const s = await seed();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.publicId, s.publicId));
    const r = await estimatePrefill(s.publicId);
    if (!("ok" in r)) throw new Error(r.error);
    expect(r.prefill.mealSizeId).toBeUndefined();
    expect(r.prefill.durationWeeks).toBeUndefined();
    expect(r.prefill.planKey).toBe(s.planKey);
  });

  it("refuses an order outside the staff member's organizations", async () => {
    const s = await seed();
    visible.ids = ["no-such-org"];
    expect(await estimatePrefill(s.publicId)).toHaveProperty("error");
  });
});
