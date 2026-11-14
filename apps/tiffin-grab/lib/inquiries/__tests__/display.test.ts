import { describe, expect, it } from "vitest";
import { displayName, roundLabel } from "../display";

describe("displayName", () => {
  it("prefers the name, then the formatted phone, then a placeholder", () => {
    expect(displayName({ fullName: "Asha", phone: "+16475334193" })).toBe("Asha");
    expect(displayName({ fullName: null, phone: "+16475334193" })).toBe("+1 647 533 4193");
    expect(displayName({ fullName: "  ", phone: null })).toBe("Unnamed lead");
  });
});

describe("roundLabel", () => {
  it("calls the first order the first sale and later orders renewals", () => {
    expect(roundLabel(null)).toBe("First sale");
    expect(roundLabel(1)).toBe("First sale");
    expect(roundLabel(2)).toBe("Renewal 1");
    expect(roundLabel(3)).toBe("Renewal 2");
  });
});
