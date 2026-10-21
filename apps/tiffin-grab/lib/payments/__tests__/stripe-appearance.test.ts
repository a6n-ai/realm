import { describe, it, expect } from "vitest";
import { stripeAppearance } from "../stripe-appearance";

describe("stripeAppearance", () => {
  it("uses saffron per scheme and the input radius", () => {
    const light = stripeAppearance("light");
    const dark = stripeAppearance("dark");
    expect(light.variables?.colorPrimary).toBe("#F06B1A");
    expect(dark.variables?.colorPrimary).toBe("#FF9843");
    expect(light.variables?.borderRadius).toBe("16px");
    expect(dark.variables?.borderRadius).toBe("16px");
  });

  it("themes the input hairline and focus ring", () => {
    const light = stripeAppearance("light");
    expect(light.rules?.[".Input"]).toMatchObject({ border: "1px solid #E3DFD1" });
    expect(light.rules?.[".Input:focus"]).toHaveProperty("boxShadow");
  });
});
