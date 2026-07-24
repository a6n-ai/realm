import { describe, expect, it } from "vitest";
import { HOME_SECTIONS } from "../home-sections";

describe("HOME_SECTIONS", () => {
  it("orders week then subscription (no wallet on home)", () => {
    expect(HOME_SECTIONS.map((s) => s.key)).toEqual(["week", "subscription"]);
  });
});
