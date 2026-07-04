import { describe, expect, it } from "vitest";
import { cardVariantClass } from "@realm/design-system";

describe("cardVariantClass", () => {
  it("defaults to glow", () => {
    expect(cardVariantClass(undefined)).toContain("card-glow");
  });
  it("lift uses hover-lift", () => {
    expect(cardVariantClass("lift")).toContain("hover-lift");
  });
  it("flat uses a border, not glow", () => {
    const c = cardVariantClass("flat");
    expect(c).toContain("border");
    expect(c).not.toContain("card-glow");
  });
});
