"use client";

import type { ClientMealSizeView } from "@/lib/catalog/types";

export function MealSizeItems({
  items,
  counts,
}: {
  items: ClientMealSizeView["items"];
  // Effective per-category counts once chosen swaps are folded in. Omitted →
  // render the catalog composition as-is.
  counts?: Record<string, number>;
}) {
  if (items.length === 0) return null;

  if (counts) {
    const entries = Object.entries(counts).filter(([, n]) => n > 0);
    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([category, n]) => (
          <span key={category} className="bg-muted rounded-full px-2 py-0.5 text-xs">
            {n}× {category}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => {
        const sizeSuffix = item.weightValue != null && item.weightUnit !== "piece" ? ` · ${item.weightValue}${item.weightUnit}` : "";
        return (
          <span key={i} className="bg-muted rounded-full px-2 py-0.5 text-xs">
            {item.qty}× {item.category}{sizeSuffix}
          </span>
        );
      })}
    </div>
  );
}
