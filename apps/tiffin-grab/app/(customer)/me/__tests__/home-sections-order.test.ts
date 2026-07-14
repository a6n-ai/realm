import { describe, expect, it } from "vitest";
import { HOME_SECTIONS } from "../home-sections";

describe("HOME_SECTIONS", () => {
  it("orders this-week-menu, meal-sizes, dishes right after subscription", () => {
    const keys = HOME_SECTIONS.map((s) => s.key);
    expect(keys).toEqual(["subscription", "menu", "mealSizes", "dishes", "browse", "coupons", "wallet", "analytics"]);
  });
});
