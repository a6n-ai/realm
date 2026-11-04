import { describe, expect, it } from "vitest";
import { gaEventFor } from "@/lib/services/tracking";

describe("gaEventFor", () => {
  it("maps Purchase to purchase with transaction_id and payment_type", () => {
    expect(
      gaEventFor({
        eventName: "Purchase",
        eventId: "purchase:pay_1",
        user: { externalId: "9" },
        customData: { value: 42.5, currency: "CAD", order_id: "ord_1" },
        transactionId: "pay_1",
        paymentType: "stripe",
      }),
    ).toEqual({
      name: "purchase",
      params: {
        transaction_id: "pay_1",
        value: 42.5,
        currency: "CAD",
        payment_type: "stripe",
        method: undefined,
      },
    });
  });

  it("falls back to order_id when transactionId is omitted", () => {
    const event = gaEventFor({
      eventName: "Purchase",
      eventId: "purchase:pay_1",
      user: {},
      customData: { value: 10, currency: "CAD", order_id: "ord_9" },
      paymentType: "etransfer",
    });
    expect(event.params?.transaction_id).toBe("ord_9");
    expect(event.params?.payment_type).toBe("etransfer");
  });

  it("maps Lead and CompleteRegistration without payment fields", () => {
    expect(gaEventFor({ eventName: "Lead", eventId: "lead:1", user: {} }).name).toBe("generate_lead");
    expect(
      gaEventFor({ eventName: "CompleteRegistration", eventId: "signup:1", user: {} }),
    ).toEqual({
      name: "sign_up",
      params: {
        transaction_id: undefined,
        value: undefined,
        currency: undefined,
        payment_type: undefined,
        method: "email",
      },
    });
  });
});
