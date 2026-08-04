import { CATEGORIES } from "@/lib/menu-categories";
import { mapCloverCategoryToLocal } from "@/lib/sync/clover-inventory-match";

export type MenuSectionInput = {
  publicId: string;
  name: string;
  productIds: string[];
};

export type MenuProduct = { publicId: string; active: boolean };

export type GroupedMenuSection<T extends MenuProduct> = {
  id: string;
  name: string;
  emoji: string;
  note: string;
  items: T[];
};

/**
 * `mapCloverCategoryToLocal` returns "extra" both for a real add-ons section
 * and for any name it cannot place, so it alone cannot answer this. A Clover
 * category named "Chef's Specials" is not an extras bucket, and treating it as
 * one would hide its out-of-stock items.
 */
function isExtrasSection(name: string): boolean {
  return mapCloverCategoryToLocal(name) === "extra" && /extra|add[- ]?on/i.test(name);
}

/**
 * Clover categories carry no marketing copy, so reuse the hand-written emoji +
 * note when a Clover category maps onto one of ours by name. Unplaceable names
 * get a neutral heading rather than another category's copy.
 */
export function copyForCloverCategory(name: string): { emoji: string; note: string } {
  const id = mapCloverCategoryToLocal(name);
  if (id !== "extra" || isExtrasSection(name)) {
    return { emoji: CATEGORIES[id].emoji, note: CATEGORIES[id].note };
  }
  return { emoji: "🍽️", note: "" };
}

/**
 * Lay the public menu out the way Clover does: sections in Clover's category
 * order, items in Clover's within-category order.
 *
 * `sections` is expected pre-sorted by the query. Out-of-stock items stay
 * visible (the menu shows them greyed out) except under an extras/add-ons
 * section, where an inactive row is noise — same rule the local-category
 * grouping has always applied. Anything Clover has not filed lands in a
 * trailing catch-all so it stays findable.
 */
export function groupByCloverSections<T extends MenuProduct>(
  rows: T[],
  sections: MenuSectionInput[],
): { sections: GroupedMenuSection<T>[]; unplaced: T[] } {
  const byPublicId = new Map(rows.map((row) => [row.publicId, row]));
  const placed = new Set<string>();
  const out: GroupedMenuSection<T>[] = [];

  for (const section of sections) {
    const dropInactive = isExtrasSection(section.name);
    const items: T[] = [];
    const seen = new Set<string>();
    for (const id of section.productIds) {
      const row = byPublicId.get(id);
      // A product can sit in one Clover category twice only through bad data,
      // but it must never render twice.
      if (!row || seen.has(id)) continue;
      seen.add(id);
      placed.add(id);
      if (dropInactive && !row.active) continue;
      items.push(row);
    }
    if (!items.length) continue;
    out.push({
      id: section.publicId,
      name: section.name,
      ...copyForCloverCategory(section.name),
      items,
    });
  }

  return { sections: out, unplaced: rows.filter((r) => r.active && !placed.has(r.publicId)) };
}
