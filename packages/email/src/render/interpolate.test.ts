import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate";

describe("interpolate", () => {
  it("replaces nested dotted vars", () => {
    expect(interpolate("Order {{order.code}}", { order: { code: "TG-1" } })).toBe("Order TG-1");
  });
  it("renders missing vars as empty string", () => {
    expect(interpolate("X{{order.nope}}Y", { order: {} })).toBe("XY");
  });
  it("stringifies non-string values", () => {
    expect(interpolate("{{p.amount}}", { p: { amount: 12.5 } })).toBe("12.5");
  });
  it("tolerates whitespace in braces", () => {
    expect(interpolate("{{ order.code }}", { order: { code: "A" } })).toBe("A");
  });
});
