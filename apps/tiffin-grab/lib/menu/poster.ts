import type { DayOfWeek } from "../deliveries/schedule/delivery-days";
import type { FileDetail } from "@foundry/storage/model";
import type { MealSlot } from "./meal-types";

export type PosterItem = {
  dayOfWeek: DayOfWeek;
  slot: string;
  dishName: string;
  position: number;
  image?: FileDetail | null;
  dishPublicId?: string;
  /** The plan this dish row belongs to (each dish is stored once per plan). */
  planName?: string;
  /** That plan's tag (plans.tag_label / tag_color), e.g. Veg in green; the customer menu marks dishes with it. */
  planLabel?: string | null;
  planColor?: string | null;
};
export type RenderedGroup = { slotLabel: string | null; dishes: { name: string }[] };
export type RenderedColumn = { label: string; groups: RenderedGroup[] };

/**
 * Editing labels. The builder writes one row per real weekday — it must never collapse
 * Sat and Sun into one, because plans do deliver on both (orderDeliveryDays appends each
 * from includeSaturday/includeSunday) and every reader keys on the actual weekday. The
 * poster below is free to *display* the weekend as one column; storage is not.
 */

/** Display grouping for the printed/marketing poster only. Not an editing shape. */
export const DAY_COLUMNS: { label: string; days: DayOfWeek[] }[] = [
  { label: "Monday", days: ["mon"] },
  { label: "Tuesday", days: ["tue"] },
  { label: "Wednesday", days: ["wed"] },
  { label: "Thursday", days: ["thu"] },
  { label: "Friday", days: ["fri"] },
  { label: "Weekends", days: ["sat", "sun"] },
];

type DayColumn = { label: string; days: DayOfWeek[] };

// A merged display column (Weekends) draws from two stored days, and the usual case is
// that both hold the same dishes — so list each name once. Without this, splitting the
// weekend into real sat/sun rows would print every weekend dish twice.
function uniqueByName(items: PosterItem[]): { name: string }[] {
  const seen = new Set<string>();
  return items.flatMap((i) => (seen.has(i.dishName) ? [] : (seen.add(i.dishName), [{ name: i.dishName }])));
}

function groupsForColumn(
  slots: MealSlot[],
  items: PosterItem[],
  col: DayColumn,
  emptyDays: "flat-placeholder" | "omit",
): RenderedGroup[] {
  const inCol = items.filter((i) => col.days.includes(i.dayOfWeek));
  const order = (a: PosterItem, b: PosterItem) =>
    col.days.indexOf(a.dayOfWeek) - col.days.indexOf(b.dayOfWeek) || a.position - b.position;
  const flat = slots.length <= 1;
  if (flat) {
    if (emptyDays === "omit" && inCol.length === 0) return [];
    return [{ slotLabel: null, dishes: uniqueByName([...inCol].sort(order)) }];
  }
  // A category with nothing on it that day is omitted entirely, not rendered as an
  // empty row. The public menu should read as what IS being served — an admin leaving
  // Protein blank on a Tuesday is not information a customer needs, and a column of
  // "—" placeholders made a half-built week look broken rather than simply shorter.
  return slots.flatMap((s) => {
    const dishes = uniqueByName(inCol.filter((i) => i.slot === s.key).sort(order));
    return dishes.length ? [{ slotLabel: s.label, dishes }] : [];
  });
}

export function buildPosterColumns(slots: MealSlot[], items: PosterItem[]): RenderedColumn[] {
  return DAY_COLUMNS.map((col) => ({
    label: col.label,
    groups: groupsForColumn(slots, items, col, "flat-placeholder"),
  }));
}
