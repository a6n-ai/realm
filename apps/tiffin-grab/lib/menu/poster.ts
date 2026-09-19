import type { FileDetail } from "@foundry/storage/model";
import type { MealSlot } from "./meal-types";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS)[number];

export type PosterItem = {
  dayOfWeek: DayOfWeek;
  slot: string;
  dishName: string;
  position: number;
  image?: FileDetail | null;
  dishPublicId?: string;
};
export type RenderedGroup = { slotLabel: string | null; dishes: { name: string }[] };
export type RenderedColumn = { label: string; groups: RenderedGroup[] };

/**
 * Editing labels. The builder writes one row per real weekday — it must never collapse
 * Sat and Sun into one, because plans do deliver on both (orderDeliveryDays appends each
 * from includeSaturday/includeSunday) and every reader keys on the actual weekday. The
 * poster below is free to *display* the weekend as one column; storage is not.
 */
export const DAY_LABELS: Record<DayOfWeek, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** Display grouping for the printed/marketing poster only. Not an editing shape. */
export const DAY_COLUMNS: { label: string; days: DayOfWeek[] }[] = [
  { label: "Monday", days: ["mon"] },
  { label: "Tuesday", days: ["tue"] },
  { label: "Wednesday", days: ["wed"] },
  { label: "Thursday", days: ["thu"] },
  { label: "Friday", days: ["fri"] },
  { label: "Weekends", days: ["sat", "sun"] },
];

/** Customer home/menu strip: one column per day, including Sat and Sun. */
export const HOME_MENU_DAY_COLUMNS: { label: string; days: DayOfWeek[] }[] = [
  { label: "Mon", days: ["mon"] },
  { label: "Tue", days: ["tue"] },
  { label: "Wed", days: ["wed"] },
  { label: "Thu", days: ["thu"] },
  { label: "Fri", days: ["fri"] },
  { label: "Sat", days: ["sat"] },
  { label: "Sun", days: ["sun"] },
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

/** Admin list + customer home: one column per weekday, empty days as no groups. */
export function buildHomeMenuColumns(slots: MealSlot[], items: PosterItem[]): RenderedColumn[] {
  return HOME_MENU_DAY_COLUMNS.map((col) => ({
    label: col.label,
    groups: groupsForColumn(slots, items, col, "omit"),
  }));
}

/** `weekStart` and other date-only ISO strings are UTC calendar dates. */
export function isoToDayOfWeek(iso: string): DayOfWeek {
  const jsDay = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return DAYS[(jsDay + 6) % 7];
}
