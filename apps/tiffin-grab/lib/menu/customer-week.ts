import { parseIsoDateUtc } from "@foundry/commons";
import type { MealSlot } from "./meal-types";
import { DAYS, type PosterItem } from "./poster";

/** What this customer has on a menu day, from their own delivery rows. */
export type MyDay = "pick" | "locked" | "delivered" | "paused" | "hold" | null;

/** `nonVeg`: this week the dish is only on non-veg plans (chicken, goat, egg...), read from each dish's plan. */
export type MenuDish = { name: string; nonVeg: boolean };

export type MenuDay = {
  date: string;
  groups: { label: string; dishes: MenuDish[] }[];
  mine: MyDay;
  /** When changes close for this day; only set while the customer can still pick. */
  cutoffAt: number | null;
};

type DeliveryRow = { deliveryDate: string; status: string; cutoffAt: number; planName?: string | null };

// Each dish is stored once per plan, often with a "(Non-Veg)" or "(Veg)" name suffix. The
// suffix is not reliable (Chicken Curry has none), so the plan filter uses the dish's plan;
// the suffix is only dropped so the full menu lists each dish once.
const plain = (name: string) => name.replace(/\s*\((?:Non-Veg|Veg)\)$/i, "");

/** The customer's plan this week; null when they have none, or more than one. */
export function planOf(deliveries: DeliveryRow[]): string | null {
  const plans = new Set(deliveries.map((d) => d.planName).filter(Boolean));
  return plans.size === 1 ? [...plans][0]! : null;
}

const isoPlus = (weekStart: string, days: number) => {
  const d = parseIsoDateUtc(weekStart);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const weekEnd = (weekStart: string) => isoPlus(weekStart, 6);

function mine(rows: DeliveryRow[], date: string, today: string, nowMs: number): MyDay {
  const live = rows.filter((r) => r.status === "scheduled");
  if (live.length) {
    if (date < today) return "delivered";
    return live.some((r) => r.cutoffAt > nowMs) ? "pick" : "locked";
  }
  if (rows.some((r) => r.status === "paused")) return "paused";
  if (rows.some((r) => r.status === "skipped")) return "hold";
  return null;
}

/** The released week as seven days in slot order, each tagged with what this customer has that day.
 *  The full menu by default; with `plan`, only that plan's dishes. */
export function buildCustomerWeek(
  week: { weekStart: string; slots: MealSlot[]; items: PosterItem[] },
  deliveries: DeliveryRow[],
  today: string,
  nowMs: number,
  plan: string | null = null,
): MenuDay[] {
  // A dish is non-veg when every plan serving it this week is a non-veg plan. Unknown plans never mark one.
  const plansByDish = new Map<string, string[]>();
  for (const it of week.items) plansByDish.set(plain(it.dishName), [...(plansByDish.get(plain(it.dishName)) ?? []), it.planName ?? ""]);
  const nonVeg = (name: string) => (plansByDish.get(name) ?? []).every((p) => /non-?veg/i.test(p));
  return DAYS.map((day, i) => {
    const date = isoPlus(week.weekStart, i);
    const items = week.items
      .filter((it) => it.dayOfWeek === day && (!plan || it.planName === plan))
      .sort((a, b) => a.position - b.position);
    const groups = week.slots
      .map((s) => ({ label: s.label, dishes: [...new Set(items.filter((it) => it.slot === s.key).map((it) => plain(it.dishName)))].map((name) => ({ name, nonVeg: nonVeg(name) })) }))
      .filter((g) => g.dishes.length > 0);
    const rows = deliveries.filter((d) => d.deliveryDate === date);
    const state = mine(rows, date, today, nowMs);
    const open = rows.filter((r) => r.status === "scheduled" && r.cutoffAt > nowMs).map((r) => r.cutoffAt);
    return { date, groups, mine: state, cutoffAt: state === "pick" ? Math.min(...open) : null };
  });
}

/** Open on today when it's in the week, else the next day this customer can still pick, else the first day with dishes. */
export function initialDay(days: MenuDay[], today: string): string {
  return (
    days.find((d) => d.date === today)?.date ??
    days.find((d) => d.mine === "pick")?.date ??
    days.find((d) => d.groups.length > 0)?.date ??
    days[0]!.date
  );
}
