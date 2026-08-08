import { describe, expect, it } from "vitest";
import { createCheckoutSchema } from "../checkout-schema";

const base = {
  items: [{ productPublicId: "p1", quantity: 1 }],
  contact: { name: "A", email: "a@b.co", phone: "+16475550100" },
};

describe("createCheckoutSchema delivery branch", () => {
  it("accepts a delivery type key and a placeId", () => {
    const parsed = createCheckoutSchema.safeParse({
      ...base,
      fulfillment: {
        type: "delivery",
        deliveryTypeKey: "instant",
        address: "3315 Danforth Ave",
        placeId: "ChIJabc",
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("REJECTS client-supplied coordinates — distance decides money", () => {
    const parsed = createCheckoutSchema.safeParse({
      ...base,
      fulfillment: {
        type: "delivery",
        deliveryTypeKey: "instant",
        address: "x",
        lat: 43.69,
        lng: -79.28,
      },
    });
    expect(parsed.success).toBe(false);
  });

  it("REJECTS a client-supplied discount or distance", () => {
    const withDiscount = createCheckoutSchema.safeParse({
      ...base,
      fulfillment: {
        type: "delivery",
        deliveryTypeKey: "instant",
        address: "x",
        discountPct: 15,
      },
    });
    expect(withDiscount.success).toBe(false);

    const withDistance = createCheckoutSchema.safeParse({
      ...base,
      fulfillment: {
        type: "delivery",
        deliveryTypeKey: "instant",
        address: "x",
        distanceKm: 2,
      },
    });
    expect(withDistance.success).toBe(false);
  });
});
