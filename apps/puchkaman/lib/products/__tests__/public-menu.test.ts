import { describe, expect, it } from "vitest";
import { copyForCloverCategory, groupByCloverSections } from "../public-menu";

const p = (publicId: string, active = true) => ({ publicId, active });

describe("groupByCloverSections", () => {
  it("keeps Clover's section order and within-section item order", () => {
    const rows = [p("a"), p("b"), p("c")];
    const { sections } = groupByCloverSections(rows, [
      { publicId: "cat_burgers", name: "Burgers", productIds: ["c", "a"] },
      { publicId: "cat_momos", name: "Momos", productIds: ["b"] },
    ]);

    expect(sections.map((s) => s.name)).toEqual(["Burgers", "Momos"]);
    expect(sections[0]!.items.map((i) => i.publicId)).toEqual(["c", "a"]);
    // Names that match our own categories keep their marketing copy.
    expect(sections[0]!.emoji).toBe("🍔");
  });

  it("shows a product in every category Clover files it under", () => {
    const rows = [p("a")];
    const { sections, unplaced } = groupByCloverSections(rows, [
      { publicId: "cat_1", name: "Burgers", productIds: ["a"] },
      { publicId: "cat_2", name: "Combos", productIds: ["a"] },
    ]);
    expect(sections.map((s) => s.name)).toEqual(["Burgers", "Combos"]);
    expect(unplaced).toEqual([]);
  });

  it("keeps out-of-stock items visible, except under extras", () => {
    const rows = [p("stale", false), p("addon", false)];
    const { sections } = groupByCloverSections(rows, [
      { publicId: "cat_burgers", name: "Burgers", productIds: ["stale"] },
      { publicId: "cat_extra", name: "Extra", productIds: ["addon"] },
    ]);
    expect(sections.map((s) => s.name)).toEqual(["Burgers"]);
    expect(sections[0]!.items.map((i) => i.publicId)).toEqual(["stale"]);
  });

  it("only applies the extras rule to real extras, not to unplaceable names", () => {
    const rows = [p("special", false)];
    const { sections } = groupByCloverSections(rows, [
      { publicId: "cat_specials", name: "Chef's Specials", productIds: ["special"] },
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0]!.items.map((i) => i.publicId)).toEqual(["special"]);
  });

  it("drops empty sections and surfaces unfiled active products", () => {
    const rows = [p("loose"), p("gone", false)];
    const { sections, unplaced } = groupByCloverSections(rows, [
      { publicId: "cat_empty", name: "Burgers", productIds: [] },
    ]);
    expect(sections).toEqual([]);
    // Inactive and unfiled stays hidden — it has no section to be greyed out in.
    expect(unplaced.map((r) => r.publicId)).toEqual(["loose"]);
  });

  it("ignores ids Clover knows about but we do not, and never repeats a row", () => {
    const rows = [p("a")];
    const { sections } = groupByCloverSections(rows, [
      { publicId: "cat_1", name: "Burgers", productIds: ["ghost", "a", "a"] },
    ]);
    expect(sections[0]!.items.map((i) => i.publicId)).toEqual(["a"]);
  });
});

describe("copyForCloverCategory", () => {
  it("borrows our copy on a name match", () => {
    expect(copyForCloverCategory("Burgers").emoji).toBe("🍔");
  });

  it("does not label an unmatched section as add-ons", () => {
    expect(copyForCloverCategory("Chef's Specials")).toEqual({ emoji: "🍽️", note: "" });
  });

  it("still uses the extras copy for a genuine extras section", () => {
    expect(copyForCloverCategory("Extra").note).toBe("Add-ons for your order.");
  });
});
