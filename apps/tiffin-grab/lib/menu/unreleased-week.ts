import { formatMenuWeekRange } from "@/lib/format/datetime";

/** Why labels (screen, print, PDF) cannot be produced for a day whose menu week is not released. */
export function unreleasedWeekMessage(weekStart: string): string {
  return `No menu is released for the week of ${formatMenuWeekRange(weekStart)}. Release that week first — labels must show the same meal the customer sees.`;
}
