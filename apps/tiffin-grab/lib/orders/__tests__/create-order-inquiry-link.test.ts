import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { db } from "@/db/client";
import { deleteNonSystemUsers, ensureSystemUser } from "@/db/test-helpers";
import { inquiries, inquiryActivities, ledgerEntries, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const failLink = { on: false };
vi.mock("@/lib/services/inquiry-links.service", async (orig) => {
  const actual = await orig<typeof import("@/lib/services/inquiry-links.service")>();
  return {
    ...actual,
    recordPurchase: (...a: Parameters<typeof actual.recordPurchase>) => (failLink.on ? Promise.reject(new Error("link down")) : actual.recordPurchase(...a)),
  };
});

const { createOrder } = await import("../create-order");

async function reset() {
  await db.delete(ledgerEntries);
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
  await db.delete(payments);
  await db.delete(orders);
  await deleteNonSystemUsers();
}

async function checkoutInput(email: string, phone: string) {
  const snap = await loadCatalogSnapshot();
  const start = nextWeekday(new Date(Date.now() + 7 * 86_400_000)).toISOString().slice(0, 10);
  return {
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch" as const],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: start,
    },
    contact: { email, fullName: "Web Buyer", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  };
}

describe("createOrder links the buyer's inquiry", () => {
  beforeEach(async () => {
    failLink.on = false;
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("a public checkout order creates and links an inquiry", async () => {
    const email = `buyer-${Math.random().toString(36).slice(2)}@test.invalid`;
    const { deploymentId } = await createOrder((await checkoutInput(email, "+16475551401")) as never, {});
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    const [buyer] = await db.select().from(users).where(eq(users.id, order.userId!));
    const rows = await db.select().from(inquiries).where(eq(inquiries.customerId, buyer.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].currentOrderId).toBe(order.id);
    expect(rows[0].stage).toBe("converted");
  });

  it("a recordPurchase failure does not fail the order", async () => {
    failLink.on = true;
    const email = `buyer-${Math.random().toString(36).slice(2)}@test.invalid`;
    const { deploymentId } = await createOrder((await checkoutInput(email, "+16475551402")) as never, {});
    const [order] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId));
    expect(order).toBeDefined();
    expect(await db.select().from(inquiries).where(eq(inquiries.customerId, order.userId!))).toHaveLength(0);
  });
});
