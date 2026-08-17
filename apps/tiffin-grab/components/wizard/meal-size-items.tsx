"use client";

import type { ClientMealSizeView, ClientSwapRule } from "@/lib/catalog/types";

type Item = ClientMealSizeView["items"][number];

// Mirrors the default path's own convention: a weight is shown unless the
// unit is "piece" (qty already says "4 roti" — "4 roti · 1piece" is noise).
function sizeSuffix(weightValue: number | null, weightUnit: Item["weightUnit"]): string {
  return weightValue != null && weightUnit !== "piece" ? ` · ${weightValue}${weightUnit}` : "";
}

export function MealSizeItems({
  items,
  counts,
  swapRules = [],
  categoryLabels,
}: {
  items: ClientMealSizeView["items"];
  // Effective per-category counts once chosen swaps are folded in. Omitted →
  // render the catalog composition as-is.
  counts?: Record<string, number>;
  // The meal size's swap rules whose portion (toWeightValue/toWeightUnit) is the
  // only place to find a size for a category the catalog has no item line for
  // (one a swap adds rather than reduces).
  swapRules?: ClientSwapRule[];
  categoryLabels?: Record<string, string>;
}) {
  if (items.length === 0) return null;
  const label = (category: string) => categoryLabels?.[category] ?? category;

  if (counts) {
    // One representative catalog line per category — same simplification the
    // kitchen label pipeline uses (lib/menu/pick-size.ts): most categories
    // have exactly one line, and a chip is a summary, not a per-slot receipt.
    const repByCategory = new Map<string, Item>();
    for (const item of items) if (!repByCategory.has(item.category)) repByCategory.set(item.category, item);
    const swapPortionByToCategory = new Map<string, string>();
    for (const rule of swapRules) {
      const suffix = sizeSuffix(rule.toWeightValue, rule.toWeightUnit);
      if (suffix) swapPortionByToCategory.set(rule.toCategory, suffix);
    }

    const entries = Object.entries(counts).filter(([, n]) => n > 0);
    return (
      <div className="flex flex-wrap gap-1.5">
        {entries.map(([category, n]) => {
          const rep = repByCategory.get(category);
          const suffix = rep ? sizeSuffix(rep.weightValue, rep.weightUnit) : swapPortionByToCategory.get(category) ?? "";
          return (
            <span key={category} className="bg-muted rounded-full px-2 py-0.5 text-xs">
              {n}× {label(category)}{suffix}
            </span>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item, i) => (
        <span key={i} className="bg-muted rounded-full px-2 py-0.5 text-xs">
          {item.qty}× {label(item.category)}{sizeSuffix(item.weightValue, item.weightUnit)}
        </span>
      ))}
    </div>
  );
}
