import { describe, expect, it } from "vitest";
import { createCheckoutSchema } from "../checkout-schema";

const base = {
  items: [{ productPublicId: "p1", quantity: 1 }],
  contact: { name: "A", email: "a@b.co", phone: "+16475550100" },
};

describe("createCheckoutSchema delivery branch", () => {
  it("accepts a placeId on the delivery branch", () => {
    const parsed = createCheckoutSchema.safeParse({
      ...base,
      fulfillment: { type: "delivery", address: "3315 Danforth Ave", placeId: "ChIJabc" },
    });
    expect(parsed.success).toBe(true);
  });

  it("REJECTS client-supplied coordinates — distance decides money", () => {
    const parsed = createCheckoutSchema.safeParse({
      ...base,
      fulfillment: { type: "delivery", address: "x", lat: 43.69, lng: -79.28 },
    });
    expect(parsed.success).toBe(false);
  });
});
