import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "../menu-categories";
import type { CloverMatchIncoming } from "./clover-inventory-types";

/** Minimal local row shape used by auto-match (avoids pulling Drizzle into unit tests). */
export type MatchableProduct = {
  publicId: string;
  name: string;
  price: string | number;
};

/**
 * A trailing portion note, e.g. "Kolkata's Special Aloo Puchka(6 Pieces)".
 * Clover names carry these; the Uber Eats menu does not, which is enough to stop
 * the same dish matching itself. Only a *trailing* parenthetical is dropped, so a
 * name that distinguishes itself mid-string is left intact.
 */
const TRAILING_PORTION_NOTE = /\s*\([^()]*\)\s*$/;

export function normalizeProductName(name: string): string {
  return name
    .replace(TRAILING_PORTION_NOTE, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Map a Clover category label onto our fixed CategoryId set; default `extra`. */
export function mapCloverCategoryToLocal(raw: string | null | undefined): CategoryId {
  if (!raw?.trim()) return "extra";
  const needle = raw.trim().toLowerCase();
  for (const id of CATEGORY_IDS) {
    if (id === needle) return id;
    if (CATEGORIES[id].name.toLowerCase() === needle) return id;
  }
  for (const id of CATEGORY_IDS) {
    const label = CATEGORIES[id].name.toLowerCase();
    if (label.includes(needle) || needle.includes(label) || needle.includes(id)) return id;
  }
  return "extra";
}

export function pricesEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

/**
 * Safe auto-match: unique unlinked local row with same normalized name AND price.
 * Name-only or multi-match → ambiguous (manual review). Never auto-links loosely.
 */
export function findSafeAutoMatch<T extends MatchableProduct>(
  item: CloverMatchIncoming,
  unlinked: T[],
): { kind: "auto"; row: T } | { kind: "ambiguous"; rows: T[] } | { kind: "none" } {
  const nameKey = normalizeProductName(item.name);
  const nameMatches = unlinked.filter((r) => normalizeProductName(r.name) === nameKey);
  if (nameMatches.length === 0) return { kind: "none" };

  const priceMatches = nameMatches.filter((r) => pricesEqual(Number(r.price), item.price));
  if (priceMatches.length === 1) return { kind: "auto", row: priceMatches[0]! };
  if (priceMatches.length > 1) return { kind: "ambiguous", rows: priceMatches };
  return { kind: "ambiguous", rows: nameMatches };
}
