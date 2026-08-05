import type { FileDetail } from "@realm/storage/model";
import type { PublicModifierGroup } from "@/lib/orders/modifier-types";

export type EatsItem = {
  publicId: string;
  name: string;
  description: string | null;
  price: number;
  image: FileDetail | null;
  tags: string[];
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
  sort: EatsSort;
};

export const EMPTY_FILTERS: EatsFilterState = {
  query: "",
  categoryIds: [],
  tags: [],
  availableOnly: false,
  sort: "menu",
};

/** Sort is not a filter: it reorders the menu but never hides anything. */
export function activeFilterCount(f: EatsFilterState): number {
  return (
    (f.query.trim() ? 1 : 0) +
    f.categoryIds.length +
    f.tags.length +
    (f.availableOnly ? 1 : 0)
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
