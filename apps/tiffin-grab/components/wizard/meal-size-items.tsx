"use client";

import type { ClientMealSizeView } from "@/lib/catalog/types";
import { mealChipLabel } from "@/lib/menu/format-tu";

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

  return (
    <div className="flex flex-wrap gap-1.5">
      {[...groups].map(([key, g]) => (
        <span key={key} className="bg-muted rounded-full px-2 py-0.5 text-xs">
          {mealChipLabel(g.count, label(g.category), g.portion)}
        </span>
      ))}
    </div>
  );
}
