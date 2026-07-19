import type { ResolvedCategory } from "@/lib/menu/resolve-delivery-meal";

export type DeliveryCardMeal = ResolvedCategory[] | { pending: true };

// One chip per distinct dish in a resolved category, "{count}× {dish}" — a category's `picks`
// can repeat the same dish (fixed categories) or vary per unit (selectable ones), so dedupe by
// name rather than rendering one chip per pick. Shared by delivery-calendar.tsx (list view) and
// pause-calendar.tsx (agenda view) — kept in a plain module so importing it doesn't create a
// "use client" <-> "use client" circular value import between those two files.
export function mealChips(meal: DeliveryCardMeal): string[] {
  if ("pending" in meal) return [];
  const chips: string[] = [];
  for (const cat of meal) {
    const counts = new Map<string, number>();
    for (const p of cat.picks) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
    for (const [name, n] of counts) chips.push(`${n}× ${name}`);
  }
  return chips;
}
