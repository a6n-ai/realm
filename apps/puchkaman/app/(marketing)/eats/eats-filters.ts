import type { FileDetail } from "@foundry/storage/model";
import type { PublicModifierGroup } from "@/lib/orders/modifier-types";

export type EatsItem = {
  publicId: string;
  name: string;
  description: string | null;
  price: number;
  image: FileDetail | null;
  tags: string[];
  /** true = vegetarian, false = non-veg, null = nobody has classified it. */
  veg: boolean | null;
  /** Active + Clover-linked + in stock — eligible for pickup cart. */
  orderable: boolean;
  category: string;
  cloverColorCode: string | null;
  /** Empty when the product takes no options — then adding is one click. */
  modifierGroups: PublicModifierGroup[];
};

export type EatsCategory = {
  id: string;
  name: string;
  emoji: string;
  note: string;
  items: EatsItem[];
};

export type EatsSort = "menu" | "price-asc" | "price-desc";

export type EatsFilterState = {
  query: string;
  categoryIds: string[];
  tags: string[];
  availableOnly: boolean;
  /** Inclusive ceiling in dollars, or null for no price bound. */
  maxPrice: number | null;
  /** Mutually exclusive — you are shopping for one or the other, never both. */
  diet: "veg" | "nonveg" | null;
  sort: EatsSort;
};

/** Price bands the panel offers. Kept small — a slider is overkill on a menu
 *  where almost everything sits between $1 and $13. */
export const PRICE_BANDS: { id: string; label: string; maxPrice: number }[] = [
  { id: "under5", label: "Under $5", maxPrice: 5 },
  { id: "under10", label: "Under $10", maxPrice: 10 },
];

export const EMPTY_FILTERS: EatsFilterState = {
  query: "",
  categoryIds: [],
  tags: [],
  availableOnly: false,
  maxPrice: null,
  diet: null,
  sort: "menu",
};

/** Initial page state — in-stock items only. "Clear filters" still resets to
 * EMPTY_FILTERS (truly nothing applied), not back to this. */
export const DEFAULT_FILTERS: EatsFilterState = { ...EMPTY_FILTERS, availableOnly: true };

/** Sort is not a filter: it reorders the menu but never hides anything. */
export function activeFilterCount(f: EatsFilterState): number {
  return (
    (f.query.trim() ? 1 : 0) +
    f.categoryIds.length +
    f.tags.length +
    (f.availableOnly ? 1 : 0) +
    (f.maxPrice != null ? 1 : 0) +
    (f.diet ? 1 : 0)
  );
}

function matchesQuery(item: EatsItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  // Every word has to land somewhere, so "spicy roll" doesn't match everything
  // that happens to contain "roll".
  const haystack = `${item.name} ${item.description ?? ""} ${item.tags.join(" ")}`.toLowerCase();
  return q.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * Filter within sections rather than flattening to one list. Grouping is how the
 * menu reads even when narrowed ("2 in Fusion Puchkas"), and it keeps one render
 * path for the filtered and unfiltered menu.
 *
 * Sections that end up empty are dropped, so an empty result is an empty array
 * and the caller can show a single "nothing matched" state.
 */
export function filterCategories(
  categories: EatsCategory[],
  f: EatsFilterState,
): EatsCategory[] {
  const wanted = new Set(f.categoryIds);
  const wantedTags = new Set(f.tags);

  return categories
    .filter((c) => wanted.size === 0 || wanted.has(c.id))
    .map((c) => {
      const items = c.items.filter((item) => {
        if (f.availableOnly && !item.orderable) return false;
        if (f.maxPrice != null && item.price > f.maxPrice) return false;
        // An unclassified item is hidden by either diet filter. Showing it
        // under "Veg" would be a dietary claim nobody made, and showing it
        // under "Non-veg" would be the same claim inverted.
        if (f.diet === "veg" && item.veg !== true) return false;
        if (f.diet === "nonveg" && item.veg !== false) return false;
        if (wantedTags.size && !item.tags.some((t) => wantedTags.has(t))) return false;
        return matchesQuery(item, f.query);
      });
      return { ...c, items: sortItems(items, f.sort) };
    })
    .filter((c) => c.items.length > 0);
}

function sortItems(items: EatsItem[], sort: EatsSort): EatsItem[] {
  if (sort === "menu") return items;
  const dir = sort === "price-asc" ? 1 : -1;
  return [...items].sort((a, b) => (a.price - b.price) * dir);
}

export function countItems(categories: EatsCategory[]): number {
  return categories.reduce((n, c) => n + c.items.length, 0);
}

/** Tags actually present on the menu, so the panel never offers a dead filter. */
export function availableTags(categories: EatsCategory[]): string[] {
  const seen = new Set<string>();
  for (const c of categories) for (const i of c.items) for (const t of i.tags) seen.add(t);
  return [...seen];
}

/**
 * How many items the menu would show if `patch` were applied on top of the
 * current filters. The panel prints this next to every option and greys out the
 * ones that would return nothing — a filter that leads to an empty menu is
 * better refused up front than discovered by clicking it.
 */
export function previewCount(
  categories: EatsCategory[],
  filters: EatsFilterState,
  patch: Partial<EatsFilterState>,
): number {
  return countItems(filterCategories(categories, { ...filters, ...patch }));
}

/** Whether anything on the menu has been classified veg/non-veg yet. The panel
 *  hides the dietary filter entirely until something has, rather than offering
 *  two options that both return an empty menu. */
export function hasDietData(categories: EatsCategory[]): boolean {
  return categories.some((c) => c.items.some((i) => i.veg !== null));
}
