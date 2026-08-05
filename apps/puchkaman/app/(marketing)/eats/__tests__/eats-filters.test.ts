import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  availableTags,
  countItems,
  EMPTY_FILTERS,
  filterCategories,
  type EatsCategory,
  type EatsItem,
} from "../eats-filters";

function item(over: Partial<EatsItem> & { name: string }): EatsItem {
  return {
    publicId: over.name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    price: 10,
    image: null,
    tags: [],
    orderable: true,
    category: "trad",
    cloverColorCode: null,
    modifierGroups: [],
    ...over,
  };
}

const MENU: EatsCategory[] = [
  {
    id: "trad",
    name: "Traditional Puchkas",
    emoji: "💧",
    note: "",
    items: [
      item({ name: "Aloo Puchka", price: 8, tags: ["best"] }),
      item({ name: "Dahi Puchka", price: 12, orderable: false }),
    ],
  },
  {
    id: "rolls",
    name: "Kathi Rolls",
    emoji: "🌯",
    note: "",
    items: [item({ name: "Paneer Roll", price: 11, description: "Smoky spicy paneer", tags: ["viral"] })],
  },
];

describe("eats filters", () => {
  it("returns the whole menu when nothing is set", () => {
    expect(countItems(filterCategories(MENU, EMPTY_FILTERS))).toBe(3);
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
  });

  it("requires every search word to match, across name and description", () => {
    const hit = filterCategories(MENU, { ...EMPTY_FILTERS, query: "spicy paneer" });
    expect(hit.flatMap((c) => c.items).map((i) => i.name)).toEqual(["Paneer Roll"]);
    // "roll" alone would match; "roll aloo" must not.
    expect(countItems(filterCategories(MENU, { ...EMPTY_FILTERS, query: "roll aloo" }))).toBe(0);
  });

  it("drops sections that end up empty rather than showing an empty heading", () => {
    const out = filterCategories(MENU, { ...EMPTY_FILTERS, tags: ["viral"] });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe("rolls");
  });

  it("hides out-of-stock items only when asked", () => {
    expect(countItems(filterCategories(MENU, { ...EMPTY_FILTERS, availableOnly: true }))).toBe(2);
    expect(countItems(filterCategories(MENU, EMPTY_FILTERS))).toBe(3);
  });

  it("sorts by price within each section without reordering sections", () => {
    const out = filterCategories(MENU, { ...EMPTY_FILTERS, sort: "price-desc" });
    expect(out.map((c) => c.id)).toEqual(["trad", "rolls"]);
    expect(out[0]?.items.map((i) => i.price)).toEqual([12, 8]);
  });

  it("counts filters but not sort, since sort hides nothing", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, sort: "price-asc" })).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, query: " ", categoryIds: ["trad"] })).toBe(1);
    expect(
      activeFilterCount({ ...EMPTY_FILTERS, query: "x", tags: ["viral"], availableOnly: true }),
    ).toBe(3);
  });

  it("only offers tags that exist on the menu", () => {
    expect(availableTags(MENU).sort()).toEqual(["best", "viral"]);
  });
});
