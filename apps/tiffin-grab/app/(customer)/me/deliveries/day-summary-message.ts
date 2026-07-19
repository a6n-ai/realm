// Plain module: one-line copy for the mobile selected-day banner above the week strip —
// same three-way kind + released-menu logic as day-detail.tsx, without pulling in client UI.

import type { CalendarCell } from "./calendar-constants";
import { calendarDayStatus } from "./day-status";
import { mealChips, type DeliveryCardMeal } from "./meal-chips";

export function selectedDaySummaryMessage({
  cell,
  delivery,
}: {
  cell: CalendarCell | undefined;
  delivery: { meal: DeliveryCardMeal } | undefined;
}): string {
  const kind: "cell" | "unreleased" | "off" = cell ? "cell" : delivery ? "unreleased" : "off";

  if (kind === "off") return "There are no orders scheduled for this day";
  if (kind === "unreleased") return "Menu not published yet";

  const status = calendarDayStatus(cell!);
  const released = !!cell!.menuWeekId && (cell!.options.length ?? 0) > 0;
  if (!released && status !== "locked") return "Menu not released yet";

  if (status === "skipped") return "This delivery is skipped";
  if (status === "paused") return "Deliveries are paused for this day";

  const chips = delivery ? mealChips(delivery.meal) : [];
  if (chips.length === 0) return "Nothing scheduled for this day";
  if (chips.length === 1) return chips[0]!;
  return `${chips.length} items scheduled`;
}
