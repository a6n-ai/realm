import type { KitchenCount } from "@/lib/services/daily-labels.service";

export type KitchenDish = { dish: string; total: number; portions: { portion: string | null; count: number }[] };

export type KitchenCategory = {
  category: string;
  label: string;
  /** Containers / packs of this category for the day. */
  containers: number;
  /**
   * What all those containers add up to, when every portion shares one unit: pieces to make
   * ("1,072 roti") or weight to cook ("2,436 oz"). Null for a generic "unit" (a rice box).
   */
  total: { amount: number; unit: string } | null;
  dishes: KitchenDish[];
};

const portionAmount = (portion: string | null) => {
  const m = portion?.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  return m ? { n: Number(m[1]), unit: m[2]! } : null;
};

/**
 * One card per category for the kitchen: dishes by volume, each dish's portions largest
 * first, plus the category's total in its own unit (roti to make, oz to cook). Counts
 * already sit under each dish's own category (countBy), not the slot it was picked in.
 */
export function groupKitchenCounts(counts: KitchenCount[]): KitchenCategory[] {
  const byCategory = new Map<string, KitchenCategory>();
  for (const c of counts) {
    let cat = byCategory.get(c.category);
    if (!cat) {
      cat = { category: c.category, label: c.categoryLabel, containers: 0, total: null, dishes: [] };
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
    // A generic "unit" (one rice box) would just restate the container count.
    if (unit && units.size === 1 && !/^units?$/i.test(unit)) {
      cat.total = { amount: parsed.reduce((n, p) => n + p.amount!.n * p.count, 0), unit };
    }
  }
  return [...byCategory.values()];
}
