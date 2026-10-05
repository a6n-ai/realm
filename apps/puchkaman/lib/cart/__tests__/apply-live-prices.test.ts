import { describe, expect, it } from "vitest";
import { applyLivePrices, type CartItem } from "../types";

const item = (over: Partial<CartItem> = {}): CartItem => ({
  productPublicId: "prd_a",
  name: "Pani Puri",
  price: 8,
  category: "chaat",
  quantity: 2,
  modifiers: [],
  ...over,
});

describe("applyLivePrices", () => {
  it("replaces a stale unit price with the server's", () => {
    const [next] = applyLivePrices([item()], [{ productPublicId: "prd_a", unitPrice: 9.5, modifiers: [] }]);
    expect(next.price).toBe(9.5);
    expect(next.quantity).toBe(2);
  });

  it("updates modifier prices and matches lines by product + modifiers", () => {
    const withMod = item({ modifiers: [{ cloverModifierId: "m1", name: "Extra", price: 1 }] });
    const plain = item();
    const next = applyLivePrices(
      [withMod, plain],
      [
        { productPublicId: "prd_a", unitPrice: 8, modifiers: [{ cloverModifierId: "m1", price: 1.5 }] },
        { productPublicId: "prd_a", unitPrice: 8.25, modifiers: [] },
      ],
    );
    expect(next[0].price).toBe(8);
    expect(next[0].modifiers[0].price).toBe(1.5);
    expect(next[1].price).toBe(8.25);
  });

  it("returns the same array when nothing changed, so state does not churn", () => {
    const items = [item()];
    expect(applyLivePrices(items, [{ productPublicId: "prd_a", unitPrice: 8, modifiers: [] }])).toBe(items);
  });

  it("leaves lines the server did not price untouched", () => {
    const items = [item({ productPublicId: "prd_gone" })];
    expect(applyLivePrices(items, [])).toBe(items);
  });
});
