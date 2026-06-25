import type { MealSlot } from "./meal-types";

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS)[number];

export type PosterItem = { dayOfWeek: DayOfWeek; slot: string; dishName: string; diet: "veg" | "nonveg"; position: number };
export type RenderedGroup = { slotLabel: string | null; dishes: { name: string; diet: "veg" | "nonveg" }[] };
export type RenderedColumn = { label: string; groups: RenderedGroup[] };

export const DAY_COLUMNS: { label: string; days: DayOfWeek[] }[] = [
  { label: "Monday", days: ["mon"] },
  { label: "Tuesday", days: ["tue"] },
  { label: "Wednesday", days: ["wed"] },
  { label: "Thursday", days: ["thu"] },
  { label: "Friday", days: ["fri"] },
  { label: "Weekends", days: ["sat", "sun"] },
];

export function buildPosterColumns(slots: MealSlot[], items: PosterItem[]): RenderedColumn[] {
  const flat = slots.length <= 1;
  return DAY_COLUMNS.map((col) => {
    const inCol = items.filter((i) => col.days.includes(i.dayOfWeek));
    const order = (a: PosterItem, b: PosterItem) =>
      col.days.indexOf(a.dayOfWeek) - col.days.indexOf(b.dayOfWeek) || a.position - b.position;
    if (flat) {
      const dishes = [...inCol].sort(order).map((i) => ({ name: i.dishName, diet: i.diet }));
      return { label: col.label, groups: [{ slotLabel: null, dishes }] };
    }
    const groups: RenderedGroup[] = slots.map((s) => ({
      slotLabel: s.label,
      dishes: inCol.filter((i) => i.slot === s.key).sort(order).map((i) => ({ name: i.dishName, diet: i.diet })),
    }));
    return { label: col.label, groups };
  });
}
