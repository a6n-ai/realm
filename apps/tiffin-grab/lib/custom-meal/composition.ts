import { formatTuHuman, tuToNatural } from "@/lib/menu/format-tu";

export type CustomMealItem = { category: string; planKey: string; tuAmount: number };
export type CategoryUnit = { key: string; label: string; tuUnitType: "weight" | "count"; tuUnitSize: number; tuUnitLabel: string; weekend?: boolean };

// EPSILON: 14.625 * 100 is 1462.4999… in float, so plain Math.round rounds cents down.
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const cmp = (a: CustomMealItem, b: CustomMealItem) =>
  a.category.localeCompare(b.category) || a.planKey.localeCompare(b.planKey) || b.tuAmount - a.tuAmount;

// Count categories (roti, rice) are one row per meal size; weight categories are one row per pick.
export function normalizeItems(items: CustomMealItem[], units: Map<string, CategoryUnit>): CustomMealItem[] {
  const out: CustomMealItem[] = [];
  const merged = new Map<string, CustomMealItem>();
  for (const raw of items) {
    const item = { ...raw, tuAmount: round2(raw.tuAmount) };
    if (!(item.tuAmount > 0)) continue;
    if (units.get(item.category)?.tuUnitType === "count") {
      const k = `${item.category}:${item.planKey}`;
      const prev = merged.get(k);
      if (prev) prev.tuAmount = round2(prev.tuAmount + item.tuAmount);
      else merged.set(k, item);
    } else {
      out.push(item);
    }
  }
  return [...merged.values(), ...out].sort(cmp);
}

export function compositionKey(items: CustomMealItem[]): string {
  return [...items].sort(cmp).map((i) => `${i.category}:${i.planKey}:${i.tuAmount}`).join("|");
}

// Only WordPress imports still infer the meal's plan from its items; staff pick it in the builder.
export function mealPlanKey(items: CustomMealItem[]): "veg" | "non-veg" {
  return items.some((i) => i.planKey === "non-veg") ? "non-veg" : "veg";
}

/**
 * Identity of a custom meal size: its items plus its own plan. Same items under the plan the
 * items would infer keep the original key, so sizes created before plans were picked still match.
 */
export function sizeCompositionKey(items: CustomMealItem[], planKey: string): string {
  const key = compositionKey(items);
  return planKey === mealPlanKey(items) ? key : `${planKey}#${key}`;
}

export const planLabel = (key: string) =>
  key === "non-veg" ? "Non-Veg" : key.replace(/(^|-)\w/g, (m) => m.toUpperCase());

export function compositionName(items: CustomMealItem[], units: Map<string, CategoryUnit>): string {
  const parts: string[] = [];
  const weightGroups = new Map<string, { n: number; item: CustomMealItem }>();
  for (const item of items) {
    const unit = units.get(item.category);
    if (!unit) { parts.push(`${item.category} ${item.tuAmount} TU`); continue; }
    if (unit.tuUnitType === "count") { parts.push(`${tuToNatural(unit, item.tuAmount)} ${unit.label}`); continue; }
    const k = `${item.category}:${item.planKey}:${item.tuAmount}`;
    const g = weightGroups.get(k);
    if (g) g.n += 1; else weightGroups.set(k, { n: 1, item });
  }
  for (const { n, item } of weightGroups.values()) {
    const unit = units.get(item.category)!;
    parts.push(`${n}× ${planLabel(item.planKey)} ${unit.label} ${formatTuHuman(unit, item.tuAmount)}`);
  }
  return parts.join(" + ");
}
