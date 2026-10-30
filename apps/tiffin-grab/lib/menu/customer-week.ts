import { parseIsoDateUtc } from "@foundry/commons";
import type { MealSlot } from "./meal-types";
import { DAYS, type PosterItem } from "./poster";

/** What this customer has on a menu day, from their own delivery rows. */
export type MyDay = "pick" | "locked" | "delivered" | "paused" | "hold" | null;

/** `nonVeg`: this week the dish is only on non-veg plans (chicken, goat, egg...), read from each dish's plan.
 *  `color`: that diet's plan tag colour (plans.tag_color), when the plan has one. */
export type MenuDish = { name: string; nonVeg: boolean; color?: string; popular?: true };

export type MenuDay = {
  date: string;
  groups: { key: string; label: string; icon?: string | null; dishes: MenuDish[] }[];
  mine: MyDay;
  /** When changes close for this day; only set while the customer can still pick. */
  cutoffAt: number | null;
};

type DeliveryRow = { deliveryDate: string; status: string; cutoffAt: number; planName?: string | null };

// Each dish is stored once per plan, often with a "(Non-Veg)" or "(Veg)" name suffix. The
// suffix is not reliable (Chicken Curry has none), so the plan filter uses the dish's plan;
// the suffix is only dropped so the full menu lists each dish once.
const plain = (name: string) => name.replace(/\s*\((?:Non-Veg|Veg)\)$/i, "");
const isNonVeg = (planName?: string) => /non-?veg/i.test(planName ?? "");

/** Fewest picks before a dish can be called Popular; below this a handful of customers would decide it. */
export const POPULAR_MIN_PICKS = 5;

/** Marks the dish customers pick most among a category's options that day: only with a real choice (2+ dishes),
 *  enough picks to mean something, and a clear lead (a tie marks nothing). */
function markPopular(dishes: MenuDish[], picks: Record<string, number>): MenuDish[] {
  if (dishes.length < 2) return dishes;
  const ranked = dishes.map((d) => picks[d.name] ?? 0).sort((a, b) => b - a);
  const [top, next] = [ranked[0]!, ranked[1]!];
  if (top < POPULAR_MIN_PICKS || top === next) return dishes;
  return dishes.map((d) => ((picks[d.name] ?? 0) === top ? { ...d, popular: true as const } : d));
}

/** Pick counts keyed by stored dish name, folded onto the plain name the menu shows ("Dal (Veg)" + "Dal (Non-Veg)" = "Dal"). */
export function foldPicks(byStoredName: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, n] of Object.entries(byStoredName)) out[plain(name)] = (out[plain(name)] ?? 0) + n;
  return out;
}

/** This week's diets as their plans tag them (Veg in green, Non-veg in red), veg first; untagged plans are left out. */
export function dietLegend(items: PosterItem[]): { label: string; color: string }[] {
  const seen = new Map<string, { label: string; color: string; nonVeg: boolean }>();
  for (const it of items) if (it.planLabel && it.planColor) seen.set(it.planLabel, { label: it.planLabel, color: it.planColor, nonVeg: isNonVeg(it.planName) });
  return [...seen.values()].sort((a, b) => Number(a.nonVeg) - Number(b.nonVeg)).map(({ label, color }) => ({ label, color }));
}

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
  /** Plain dish name to how often customers picked it (see foldPicks); marks each category's Popular dish. */
  picks: Record<string, number> = {},
): MenuDay[] {
  // A dish is non-veg when every plan serving it this week is a non-veg plan. Unknown plans never mark one.
  const servedBy = new Map<string, PosterItem[]>();
  for (const it of week.items) servedBy.set(plain(it.dishName), [...(servedBy.get(plain(it.dishName)) ?? []), it]);
  const nonVeg = (name: string) => (servedBy.get(name) ?? []).every((it) => isNonVeg(it.planName));
  // The colour of a plan on the dish's side: a veg dish also served on the non-veg plan still reads veg.
  const color = (name: string) => (servedBy.get(name) ?? []).find((it) => isNonVeg(it.planName) === nonVeg(name) && it.planColor)?.planColor ?? undefined;
  return DAYS.map((day, i) => {
    const date = isoPlus(week.weekStart, i);
    const items = week.items
      .filter((it) => it.dayOfWeek === day && (!plan || it.planName === plan))
      .sort((a, b) => a.position - b.position);
    const groups = week.slots
      .map((s) => ({ key: s.key, label: s.label, icon: s.icon, dishes: [...new Set(items.filter((it) => it.slot === s.key).map((it) => plain(it.dishName)))].map((name) => ({ name, nonVeg: nonVeg(name), color: color(name) })) }))
      .map((g) => ({ ...g, dishes: markPopular(g.dishes, picks) }))
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
