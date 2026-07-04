import { describe, expect, it } from "vitest";
import { matchZone, type ZoneLike } from "./postal";

const zones: ZoneLike[] = [
  { name: "Etobicoke", postalPrefixes: ["M8", "M9"], slotWindow: "9–12", active: true },
  { name: "Mississauga", postalPrefixes: ["L5"], slotWindow: "10–1", active: true },
  { name: "Markham", postalPrefixes: ["L3R"], slotWindow: "11–2", active: true },
  { name: "Inactive", postalPrefixes: ["X1"], slotWindow: "n/a", active: false },
];

describe("matchZone", () => {
  it("matches a served FSA prefix (Etobicoke M9V)", () => {
    expect(matchZone("M9V 1A1", zones)?.name).toBe("Etobicoke");
  });
  it("normalizes case and spacing", () => {
    expect(matchZone("l5b2c3", zones)?.name).toBe("Mississauga");
  });
  it("prefers a longer/more-specific prefix (L3R over a bare L3)", () => {
    expect(matchZone("L3R 9K1", zones)?.name).toBe("Markham");
  });
  it("returns null for a non-served region (Ottawa K1A)", () => {
    expect(matchZone("K1A 0B1", zones)).toBeNull();
  });
  it("ignores inactive zones", () => {
    expect(matchZone("X1Y 2Z3", zones)).toBeNull();
  });
});
