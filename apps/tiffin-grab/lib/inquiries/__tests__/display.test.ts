import { describe, expect, it } from "vitest";
import { displayName } from "../display";

describe("displayName", () => {
  it("prefers the name, then the formatted phone, then a placeholder", () => {
    expect(displayName({ fullName: "Asha", phone: "+16475334193" })).toBe("Asha");
    expect(displayName({ fullName: null, phone: "+16475334193" })).toBe("+1 647 533 4193");
    expect(displayName({ fullName: "  ", phone: null })).toBe("Unnamed lead");
  });
});
