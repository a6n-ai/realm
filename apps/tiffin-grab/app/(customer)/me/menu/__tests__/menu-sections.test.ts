import { describe, expect, it } from "vitest";
import { MENU_SECTIONS } from "../menu-sections";

describe("MENU_SECTIONS", () => {
  it("orders menu, mealSizes, dishes, browse", () => {
    expect(MENU_SECTIONS.map((s) => s.key)).toEqual(["menu", "mealSizes", "dishes", "browse"]);
  });
});
