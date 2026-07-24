import { describe, expect, it } from "vitest";
import { MENU_SECTIONS } from "../menu-sections";

describe("MENU_SECTIONS", () => {
  it("orders this-week menu, dish gallery, then slim plans CTA", () => {
    expect(MENU_SECTIONS.map((s) => s.key)).toEqual(["menu", "dishes", "plansCta"]);
  });
});
