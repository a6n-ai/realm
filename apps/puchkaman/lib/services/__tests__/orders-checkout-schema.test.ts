import { describe, expect, it } from "vitest";
import { createCheckoutSchema, payCheckoutSchema } from "../../orders/checkout-schema";

describe("checkout schemas", () => {
  it("accepts a valid create payload", () => {
    const parsed = createCheckoutSchema.parse({
      items: [{ productPublicId: "prd_abc", quantity: 2 }],
      contact: { name: "Ada", email: "ada@example.com", phone: "4165550000" },
    });
    expect(parsed.items[0]?.quantity).toBe(2);
    expect(parsed.contact.email).toBe("ada@example.com");
  });

  it("rejects empty cart", () => {
    expect(() =>
      createCheckoutSchema.parse({
        items: [],
        contact: { name: "Ada", email: "ada@example.com" },
      }),
    ).toThrow();
  });

  it("requires source token for pay", () => {
    expect(() => payCheckoutSchema.parse({ orderPublicId: "ord_1", source: "" })).toThrow();
    expect(
      payCheckoutSchema.parse({ orderPublicId: "ord_1", source: "clv_token" }).source,
    ).toBe("clv_token");
  });
});
