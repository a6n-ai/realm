import { describe, expect, it } from "vitest";
import {
  buildAtomicOrderBody,
  cloverCheckoutSdkUrl,
  expandAtomicLineItems,
  normalizeAtomicCheckoutResult,
  normalizeAtomicOrderResult,
  normalizeChargeResult,
  normalizePakmsKey,
  normalizePayOrderResult,
} from "../orders";

describe("expandAtomicLineItems", () => {
  it("repeats lines by quantity", () => {
    expect(
      expandAtomicLineItems([
        { itemId: "A", quantity: 2, name: "Puchka" },
        { itemId: "B", quantity: 1 },
      ]),
    ).toEqual([
      { itemId: "A", name: "Puchka" },
      { itemId: "A", name: "Puchka" },
      { itemId: "B", name: undefined },
    ]);
  });
});

describe("buildAtomicOrderBody", () => {
  it("builds orderCart with inventory refs", () => {
    const body = buildAtomicOrderBody({
      lineItems: [{ itemId: "ITEM1", name: "Puchka" }],
      orderTypeId: "TYPE1",
      note: "Pickup",
    });
    expect(body).toEqual({
      orderCart: {
        lineItems: [{ item: { id: "ITEM1" }, printed: false, name: "Puchka" }],
        groupLineItems: false,
        orderType: { id: "TYPE1" },
        note: "Pickup",
      },
    });
  });

  // Clover bills the inventory price for `item: {id}` lines and discards any price
  // we send, so sending one would only invite the caller to trust a number Clover ignores.
  it("never sends a price override", () => {
    const body = buildAtomicOrderBody({
      lineItems: [{ itemId: "ITEM1", name: "Puchka" }],
    }) as { orderCart: { lineItems: Record<string, unknown>[] } };
    expect(body.orderCart.lineItems[0]).not.toHaveProperty("price");
  });

  it("rejects empty carts", () => {
    expect(() => buildAtomicOrderBody({ lineItems: [] })).toThrow(/at least one/);
  });

  it("passes order-level discounts through as negative cents", () => {
    const body = buildAtomicOrderBody({
      lineItems: [{ itemId: "ITEM1" }],
      discounts: [{ name: "Instant delivery (15%)", amount: -150 }],
    });
    expect(body).toMatchObject({
      orderCart: { discounts: [{ name: "Instant delivery (15%)", amount: -150 }] },
    });
  });

  it("omits discounts entirely when there are none", () => {
    const body = buildAtomicOrderBody({ lineItems: [{ itemId: "ITEM1" }] }) as {
      orderCart: Record<string, unknown>;
    };
    expect(body.orderCart).not.toHaveProperty("discounts");
  });

  it("includes employee when provided", () => {
    const body = buildAtomicOrderBody({
      lineItems: [{ itemId: "ITEM1", name: "Puchka" }],
      employeeId: "EMP1",
    });
    expect(body).toMatchObject({
      orderCart: expect.any(Object),
      employee: { id: "EMP1" },
    });
  });
});

describe("normalizeAtomicCheckoutResult", () => {
  // Captured verbatim from a live merchant: one $9.99 item, default 13% tax rate.
  const live = {
    orderCart: { lineItems: { elements: [] }, discounts: { elements: [] } },
    total: 1129,
    subtotal: 999,
    totalTaxAmount: 130,
    taxSummaries: {
      elements: [
        { id: "PNF6CV7VAK4GT", name: "Tax", amount: 130, gross: 1129, net: 999, rate: 1300000 },
      ],
    },
    isVat: false,
  };

  it("unwraps totals and the taxSummaries elements array", () => {
    expect(normalizeAtomicCheckoutResult(live)).toMatchObject({
      subtotal: 999,
      totalTaxAmount: 130,
      total: 1129,
      taxSummaries: [{ id: "PNF6CV7VAK4GT", amount: 130, net: 999, rate: 1300000 }],
    });
  });

  it("tolerates a missing taxSummaries collection", () => {
    expect(normalizeAtomicCheckoutResult({ total: 500, subtotal: 500 }).taxSummaries).toEqual([]);
  });

  it("rejects a response with no total rather than defaulting it to zero", () => {
    expect(() => normalizeAtomicCheckoutResult({ subtotal: 999 })).toThrow(/missing total/);
  });
});

describe("normalize helpers", () => {
  it("normalizes atomic order id", () => {
    expect(normalizeAtomicOrderResult({ id: "ORD1", total: 1200, currency: "CAD" })).toMatchObject({
      id: "ORD1",
      total: 1200,
    });
  });

  it("normalizes pay-order with charge string", () => {
    expect(
      normalizePayOrderResult({ id: "ORD1", status: "paid", charge: "CHG1", amount: 1200 }),
    ).toMatchObject({ id: "ORD1", status: "paid", chargeId: "CHG1" });
  });

  it("normalizes PAKMS key", () => {
    expect(normalizePakmsKey({ apiAccessKey: "pakms_abc", active: true })).toEqual({
      apiAccessKey: "pakms_abc",
      active: true,
      merchantUuid: undefined,
      developerAppUuid: undefined,
    });
  });

  it("normalizes charge", () => {
    expect(
      normalizeChargeResult({
        id: "CHG1",
        status: "succeeded",
        paid: true,
        amount: 500,
        order: "ORD1",
      }),
    ).toMatchObject({
      id: "CHG1",
      status: "succeeded",
      paid: true,
      orderId: "ORD1",
    });
  });
});

describe("cloverCheckoutSdkUrl", () => {
  it("returns sandbox vs production hosts", () => {
    expect(cloverCheckoutSdkUrl("sandbox")).toContain("checkout.sandbox.dev.clover.com");
    expect(cloverCheckoutSdkUrl("production")).toBe("https://checkout.clover.com/sdk.js");
  });
});
