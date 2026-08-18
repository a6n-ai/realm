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

  // One representative catalog line per category — a row IS one dish pick now,
  // so "N×" comes from counting rows in a category, not a qty column.
  const countByCategory = new Map<string, number>();
  const repByCategory = new Map<string, Item>();
  for (const item of items) {
    countByCategory.set(item.category, (countByCategory.get(item.category) ?? 0) + 1);
    if (!repByCategory.has(item.category)) repByCategory.set(item.category, item);
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {[...repByCategory.entries()].map(([category, rep]) => (
        <span key={category} className="bg-muted rounded-full px-2 py-0.5 text-xs">
          {mealChipLabel(countByCategory.get(category) ?? 0, label(category), rep.portion)}
        </span>
      ))}
    </div>
  );
}
