import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  availableTags,
  countItems,
  EMPTY_FILTERS,
  previewCount,
  filterCategories,
  hasDietData,
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
    veg: null,
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

describe("price band", () => {
  it("keeps only items at or under the ceiling", () => {
    const out = filterCategories(MENU, { ...EMPTY_FILTERS, maxPrice: 10 });
    expect(countItems(out)).toBe(1);
    expect(out.every((c) => c.items.every((i) => i.price <= 10))).toBe(true);
  });

  it("counts as one active filter", () => {
    expect(activeFilterCount({ ...EMPTY_FILTERS, maxPrice: 10 })).toBe(1);
  });
});

describe("previewCount", () => {
  it("reports what a candidate filter would show, not the current view", () => {
    expect(previewCount(MENU, EMPTY_FILTERS, { maxPrice: 10 })).toBe(1);
    expect(countItems(filterCategories(MENU, EMPTY_FILTERS))).toBe(3);
  });

  it("respects the filters already applied", () => {
    // Aloo Puchka is the only item under $10, and it is not viral — stacking
    // the two can only reach zero.
    expect(previewCount(MENU, { ...EMPTY_FILTERS, tags: ["viral"] }, { maxPrice: 10 })).toBe(0);
  });

  it("returns zero for a combination with nothing behind it, so the panel can disable it", () => {
    expect(previewCount(MENU, EMPTY_FILTERS, { maxPrice: 1 })).toBe(0);
  });
});

describe("dietary filter", () => {
  const DIET: EatsCategory[] = [
    {
      id: "trad",
      name: "Traditional Puchkas",
      emoji: "💧",
      note: "",
      items: [
        item({ name: "Aloo Puchka", veg: true }),
        item({ name: "Chicken Puchka", veg: false }),
        item({ name: "Mystery Puchka" }),
      ],
    },
  ];

  it("shows only classified vegetarian items", () => {
    const out = filterCategories(DIET, { ...EMPTY_FILTERS, diet: "veg" });
    expect(out[0]!.items.map((i) => i.name)).toEqual(["Aloo Puchka"]);
  });

  it("shows only classified non-veg items", () => {
    const out = filterCategories(DIET, { ...EMPTY_FILTERS, diet: "nonveg" });
    expect(out[0]!.items.map((i) => i.name)).toEqual(["Chicken Puchka"]);
  });

  it("never files an unclassified item under either diet", () => {
    const veg = filterCategories(DIET, { ...EMPTY_FILTERS, diet: "veg" });
    const nonveg = filterCategories(DIET, { ...EMPTY_FILTERS, diet: "nonveg" });
    const shown = [...veg, ...nonveg].flatMap((c) => c.items.map((i) => i.name));
    expect(shown).not.toContain("Mystery Puchka");
  });

  it("is hidden until something on the menu is classified", () => {
    expect(hasDietData(MENU)).toBe(false);
    expect(hasDietData(DIET)).toBe(true);
  });
});
