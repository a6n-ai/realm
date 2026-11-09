"use client";

import type { ClientMealSizeView } from "@/lib/catalog/types";

type Item = ClientMealSizeView["items"][number];

// item.portion is precomputed server-side (lib/catalog/load.ts) via formatTuHuman —
// "12oz" / "4 roti", never a raw TU amount.

export function MealSizeItems({
  items,
  categoryLabels,
}: {
  items: ClientMealSizeView["items"];
  categoryLabels?: Record<string, string>;
}) {
  if (items.length === 0) return null;
  const label = (category: string) => categoryLabels?.[category] ?? category;

  // One chip per category and portion: a row IS one dish pick, so "N×" counts rows, but a 12oz main sabzi
  // and an 8oz side sabzi are different containers and must not collapse into "2× Sabzi · 12oz".
  const groups = new Map<string, { category: string; portion: Item["portion"]; count: number }>();
  for (const item of items) {
    const key = `${item.category}|${item.portion ?? ""}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { category: item.category, portion: item.portion, count: 1 });
  }

  // One plain line ("Sabzi 12oz · Daal 12oz · 2× Roti 4 roti"), legible at 13px, instead of a wall of tiny chips.
  return (
    <p className="text-[14px] leading-snug text-pretty text-foreground/72">
      {[...groups].map(([key, g], i) => (
        <span key={key}>
          {i > 0 && <span aria-hidden className="text-muted-foreground"> · </span>}
          <span className="whitespace-nowrap">{itemLabel(g.count, label(g.category), g.portion)}</span>
        </span>
      ))}
    </p>
  );
}

/** "Sabzi 12oz", "4 roti", "Rice": the count only when more than one; a portion that already names the item
 *  ("4 roti") stands alone, and a single unit ("1 unit") says nothing the name doesn't. */
export function itemLabel(count: number, name: string, portion: string | null | undefined): string {
  const times = count > 1 ? `${count}× ` : "";
  const p = portion?.trim() ?? "";
  if (!p || /^1 units?$/i.test(p)) return `${times}${name}`;
  if (p.toLowerCase().endsWith(name.toLowerCase())) return `${times}${p}`;
  return `${times}${name} ${p}`;
}
