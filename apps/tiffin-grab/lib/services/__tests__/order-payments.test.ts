import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { payments } = await import("@/db/schema");
const { orderPaymentStatuses, paidStatusOf } = await import("@/lib/payments/order-payments");
const { makeTripOrder, resetTrips } = await import("./trip-fixture");

const DEP = "SUB-ORDPAY01";
const PFX = "tordpay";

describe("orderPaymentStatuses", () => {
  beforeEach(() => resetTrips(DEP, PFX));
  afterAll(() => resetTrips(DEP, PFX));

  it("lists the plan's payments newest first and ignores add-on requests", async () => {
    const { order } = await makeTripOrder(DEP, PFX);
    await db.insert(payments).values({ orderId: order.id, amount: "5.00", method: "stripe", status: "awaiting_payment" });
    await db.insert(payments).values({
      orderId: order.id, amount: "9.00", method: "stripe", status: "paid",
      addonRequest: { selections: [], taxes: [], openTiffins: 0, lines: [], addonSubtotal: 0, taxTotal: 0, amountDue: 9, quotedAt: 0 },
    });
    const statuses = (await orderPaymentStatuses(db, [order.id])).get(order.id);
    expect(statuses).toEqual(["awaiting_payment", "paid"]);
    expect(paidStatusOf(statuses)).toBe("paid");
  });

  it("paid means money confirmed on any plan payment, not the first row read", () => {
    expect(paidStatusOf(["awaiting_payment", "simulated_paid"])).toBe("simulated_paid");
    expect(paidStatusOf(["awaiting_payment", "refunded"])).toBeNull();
    expect(paidStatusOf(undefined)).toBeNull();
  });
});
