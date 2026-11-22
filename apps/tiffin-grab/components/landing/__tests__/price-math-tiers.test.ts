import { describe, expect, it } from "vitest";
import { deliveryOffFor } from "../price-math";

const tiered = { off: { 4: 10 }, offByDays: { 3: { 4: 0 }, 4: { 4: 8 }, 5: { 4: 10 } } };

describe("deliveryOffFor", () => {
  it("prices the picked eating days, not the best tier", () => {
    expect(deliveryOffFor(tiered, 4, 4)).toBe(8);
    expect(deliveryOffFor(tiered, 5, 4)).toBe(10);
  });
  it("is 0 below the first tier, so the receipt line hides", () => {
    expect(deliveryOffFor(tiered, 3, 4)).toBe(0);
  });
  it("untiered frequencies use the flat rate; none gives 0", () => {
    expect(deliveryOffFor({ off: { 4: 6 } }, 5, 4)).toBe(6);
    expect(deliveryOffFor(undefined, 5, 4)).toBe(0);
  });
});
