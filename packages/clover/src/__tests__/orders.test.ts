import { describe, expect, it } from "vitest";
import {
  buildAtomicOrderBody,
  cloverCheckoutSdkUrl,
  expandAtomicLineItems,
  normalizeAtomicOrderResult,
  normalizeChargeResult,
  normalizePakmsKey,
  normalizePayOrderResult,
} from "../orders";

describe("expandAtomicLineItems", () => {
  it("repeats lines by quantity", () => {
    expect(
      expandAtomicLineItems([
        { itemId: "A", quantity: 2, name: "Puchka", priceCents: 500 },
        { itemId: "B", quantity: 1 },
      ]),
    ).toEqual([
      { itemId: "A", name: "Puchka", price: 500 },
      { itemId: "A", name: "Puchka", price: 500 },
      { itemId: "B", name: undefined, price: undefined },
    ]);
  });
});

describe("buildAtomicOrderBody", () => {
  it("builds orderCart with inventory refs", () => {
    const body = buildAtomicOrderBody({
      lineItems: [{ itemId: "ITEM1", name: "Puchka", price: 599 }],
      orderTypeId: "TYPE1",
      note: "Pickup",
    });
    expect(body).toEqual({
      orderCart: {
        lineItems: [{ item: { id: "ITEM1" }, printed: false, name: "Puchka", price: 599 }],
        groupLineItems: false,
        orderType: { id: "TYPE1" },
        note: "Pickup",
      },
    });
  });

  it("rejects empty carts", () => {
    expect(() => buildAtomicOrderBody({ lineItems: [] })).toThrow(/at least one/);
  });

  it("includes employee when provided", () => {
    const body = buildAtomicOrderBody({
      lineItems: [{ itemId: "ITEM1", name: "Puchka", price: 599 }],
      employeeId: "EMP1",
    });
    expect(body).toMatchObject({
      orderCart: expect.any(Object),
      employee: { id: "EMP1" },
    });
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
