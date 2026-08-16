"use client";

import { Button } from "@realm/ui/button";
import type { ClientMealSizeView, ClientSwapRule } from "@/lib/catalog/types";

export function effectiveCounts(
  items: ClientMealSizeView["items"],
  rules: ClientSwapRule[],
  chosenIds: string[],
): Record<string, number> {
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.category] = (acc[i.category] ?? 0) + i.qty;
    return acc;
  }, {});
  for (const id of chosenIds) {
    const rule = rules.find((r) => r.publicId === id);
    if (!rule) continue;
    counts[rule.fromCategory] = (counts[rule.fromCategory] ?? 0) - rule.qtyFrom;
    counts[rule.toCategory] = (counts[rule.toCategory] ?? 0) + rule.qtyTo;
  }
  return counts;
}

// Mirrors the server's validateSwapStack. UX only — createOrder re-checks every
// chosen rule against the meal size's own composition.
function canAfford(counts: Record<string, number>, rule: ClientSwapRule): boolean {
  return (counts[rule.fromCategory] ?? 0) >= rule.qtyFrom;
}

export function SwapPicker({
  mealSize,
  chosenIds,
  onChange,
}: {
  mealSize: ClientMealSizeView;
  chosenIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const rules = mealSize.swapRules;
  if (rules.length === 0) return null;
  const counts = effectiveCounts(mealSize.items, rules, chosenIds);

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-muted-foreground text-xs font-medium">Swap items (optional, no extra cost)</p>
      <div className="flex flex-wrap gap-2">
        {rules.map((rule) => {
          const chosen = chosenIds.includes(rule.publicId);
          const portion = rule.toWeightValue != null && rule.toWeightUnit != null
            ? ` (${rule.toWeightValue}${rule.toWeightUnit === "piece" ? " pc" : rule.toWeightUnit})`
            : "";
          return (
            <Button
              key={rule.publicId}
              type="button"
              size="sm"
              variant={chosen ? "default" : "outline"}
              disabled={!chosen && !canAfford(counts, rule)}
              onClick={(e) => {
                // The whole meal-size card is a click target; a swap toggle must
                // not re-select the card underneath it.
                e.stopPropagation();
                onChange(chosen ? chosenIds.filter((id) => id !== rule.publicId) : [...chosenIds, rule.publicId]);
              }}
            >
              {rule.qtyFrom} {rule.fromCategory} → {rule.qtyTo} {rule.toCategory}{portion}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
