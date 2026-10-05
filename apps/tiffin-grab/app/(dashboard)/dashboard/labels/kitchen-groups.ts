import type { KitchenCount } from "@/lib/services/daily-labels.service";

export type KitchenDish = { dish: string; total: number; portions: { portion: string | null; count: number }[] };

export type KitchenCategory = {
  category: string;
  label: string;
  /** Containers / packs of this category for the day. */
  containers: number;
  /** Pieces across every pack ("1,072 roti") when all portions share one count unit; null otherwise. */
  pieces: { amount: number; unit: string } | null;
  dishes: KitchenDish[];
};

const portionAmount = (portion: string | null) => {
  const m = portion?.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  return m ? { n: Number(m[1]), unit: m[2]! } : null;
};

/**
 * One card per category for the kitchen: dishes by volume, each dish's portions largest
 * first. Count units ("8 roti") also get a piece total so the roti station knows how many
 * to make, not only how many packs; weights (oz) stay container counts.
 */
export function groupKitchenCounts(counts: KitchenCount[]): KitchenCategory[] {
  // The kitchen cooks a dish once, whatever slot it fills: Kali Dal picked as side 2 of the
  // Sabzi slot is the same pot as the Daal slot's Kali Dal. Each dish therefore lives in the
  // one category that serves the most of it, and its portions merge there.
  const perCategory = new Map<string, Map<string, number>>();
  for (const c of counts) {
    const m = perCategory.get(c.dish) ?? new Map<string, number>();
    m.set(c.category, (m.get(c.category) ?? 0) + c.count);
    perCategory.set(c.dish, m);
  }
  const home = new Map<string, string>();
  for (const [dish, m] of perCategory) home.set(dish, [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0]);
  const labelOf = new Map(counts.map((c) => [c.category, c.categoryLabel]));
  const merged = new Map<string, KitchenCount>();
  for (const c of counts) {
    const category = home.get(c.dish)!;
    const key = `${category}|${c.dish}|${c.portion ?? ""}`;
    const hit = merged.get(key);
    if (hit) hit.count += c.count;
    else merged.set(key, { ...c, category, categoryLabel: labelOf.get(category)! });
  }

  const byCategory = new Map<string, KitchenCategory>();
  for (const c of merged.values()) {
    let cat = byCategory.get(c.category);
    if (!cat) {
      cat = { category: c.category, label: c.categoryLabel, containers: 0, pieces: null, dishes: [] };
      byCategory.set(c.category, cat);
    }
    cat.containers += c.count;
    let dish = cat.dishes.find((d) => d.dish === c.dish);
    if (!dish) {
      dish = { dish: c.dish, total: 0, portions: [] };
      cat.dishes.push(dish);
    }
    dish.total += c.count;
    dish.portions.push({ portion: c.portion, count: c.count });
  }

  for (const cat of byCategory.values()) {
    cat.dishes.sort((a, b) => b.total - a.total || a.dish.localeCompare(b.dish));
    for (const d of cat.dishes) {
      d.portions.sort((a, b) => (portionAmount(b.portion)?.n ?? 0) - (portionAmount(a.portion)?.n ?? 0));
    }
    const parsed = cat.dishes.flatMap((d) => d.portions.map((p) => ({ amount: portionAmount(p.portion), count: p.count })));
    const units = new Set(parsed.map((p) => p.amount?.unit));
    const unit = parsed[0]?.amount?.unit;
    // Only pieces a cook makes ("roti") are worth totalling; weights ("8oz") and a generic
    // "unit" (one rice box) would just restate the container count.
    if (unit && units.size === 1 && !/^(oz|g|ml|units?)$/i.test(unit)) {
      cat.pieces = { amount: parsed.reduce((n, p) => n + p.amount!.n * p.count, 0), unit };
    }
  }
  return [...byCategory.values()];
}
