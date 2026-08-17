import { afterEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";

// Minimal stub: getResumableCheckout only needs the pakms key + environment.
vi.mock("@/lib/clover/client", () => ({
  createCloverClient: async () => ({
    getPakmsApiKey: async () => ({ apiAccessKey: "pakms_test" }),
    environment: () => "sandbox" as const,
  }),
}));

const { db } = await import("@/db/client");
const { orders, payments } = await import("@/db/schema");
const { ordersService } = await import("../orders.service");

const MARK = "resumable-checkout";
const orderIds: bigint[] = [];

afterEach(async () => {
  if (orderIds.length === 0) return;
  await db.delete(payments).where(inArray(payments.orderId, orderIds));
  await db.delete(orders).where(inArray(orders.id, orderIds));
  orderIds.length = 0;
});

async function seedOrder(opts: {
  status: "pending" | "paid";
  cloverOrderId: string | null;
  paymentStatus: "awaiting_payment" | "paid" | null;
}) {
  const [row] = await db
    .insert(orders)
    .values({
      status: opts.status,
      fulfillment: "pickup",
      customerName: MARK,
      customerEmail: `${MARK}@example.test`,
      customerPhone: "+14165550123",
      subtotal: "10.00",
      tax: "1.30",
      total: "11.30",
      pricingSnapshot: { currency: "CAD", lines: [], subtotal: 10, tax: 1.3, total: 11.3 },
      cloverOrderId: opts.cloverOrderId,
    })
    .returning();
  orderIds.push(row.id);
  if (opts.paymentStatus) {
    await db.insert(payments).values({
      orderId: row.id,
      status: opts.paymentStatus,
      method: "clover",
      amount: "11.30",
    });
  }
  return row;
}

describe("getResumableCheckout", () => {
  it("returns null for a paid order", async () => {
    const order = await seedOrder({ status: "paid", cloverOrderId: "clv_1", paymentStatus: "paid" });
    expect(await ordersService.getResumableCheckout(order.publicId)).toBeNull();
  });

  it("returns null when there is no awaiting_payment payment row", async () => {
    const order = await seedOrder({ status: "pending", cloverOrderId: "clv_2", paymentStatus: null });
    expect(await ordersService.getResumableCheckout(order.publicId)).toBeNull();
  });

  it("returns the resumable shape for a genuinely resumable order", async () => {
    const order = await seedOrder({
      status: "pending",
      cloverOrderId: "clv_3",
      paymentStatus: "awaiting_payment",
    });
    const result = await ordersService.getResumableCheckout(order.publicId);
    expect(result).toEqual({
      orderPublicId: order.publicId,
      cloverOrderId: "clv_3",
      total: 11.3,
      currency: "CAD",
      pakmsKey: "pakms_test",
      checkoutSdkUrl: expect.any(String),
      environment: "sandbox",
    });
  });
});
