import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, orders, payments } = await import("@/db/schema");
const { createOrder } = await import("../orders.service");
const { setPaymentConfig } = await import("../app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput, reset, cleanup } = await import("./stripe-fixture");

const HOUR = 3600_000;

async function load(publicId: string) {
  const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
  const [pay] = await db.select().from(payments).where(eq(payments.orderId, order!.id));
  const rows = await db.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.orderId, order!.id));
  return { order: order!, pay: pay!, deliveries: rows.length };
}

describe("Stripe orders wait pending until paid", () => {
  beforeEach(async () => {
    await reset();
    await setPaymentConfig({
      methods: [
        { id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] },
        { id: "stripe", kind: "online", enabled: true, label: "Card", taxes: [] },
      ],
    });
    await sharedCache("app-settings").evictAll();
  });
  afterAll(cleanup);

  it("creates a Stripe checkout order pending with no deliveries", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }));
    const r = await load(publicId);
    expect(r.order.status).toBe("pending");
    expect(r.deliveries).toBe(0);
    expect(r.pay.status).toBe("awaiting_payment");
    expect(Math.abs(Number(r.pay.expiresAt) - (Date.now() + 48 * HOUR))).toBeLessThan(60_000);
  });

  it("gives staff-created Stripe orders 7 days", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "stripe" }), { staffCreated: true, allowSameDayStart: true });
    const r = await load(publicId);
    expect(r.order.status).toBe("pending");
    expect(Math.abs(Number(r.pay.expiresAt) - (Date.now() + 7 * 24 * HOUR))).toBeLessThan(60_000);
  });

  it("still starts e-Transfer orders at create", async () => {
    const { publicId } = await createOrder(await baseInput({ paymentMethodId: "etransfer" }));
    const r = await load(publicId);
    expect(r.order.status).toBe("active");
    expect(r.deliveries).toBeGreaterThan(0);
    expect(r.pay.expiresAt).toBeNull();
  });

  it("keeps out-of-zone Stripe orders waitlisted", async () => {
    const input = await baseInput({ paymentMethodId: "stripe" });
    input.contact.postalCode = "V6B 1A1";
    const { publicId } = await createOrder(input);
    expect((await load(publicId)).order.status).toBe("waitlisted");
  });
});
