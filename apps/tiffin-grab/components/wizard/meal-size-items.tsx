"use client";

import type { ClientMealSizeView } from "@/lib/catalog/types";

export function MealSizeItems({ items }: { items: ClientMealSizeView["items"] }) {
  if (items.length === 0) return null;

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
