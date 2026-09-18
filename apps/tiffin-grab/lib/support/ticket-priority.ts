import { tickets } from "@/db/schema/tickets";

export type TicketPriorityValue = (typeof tickets.priority.enumValues)[number];

/**
 * One priority vocabulary for the whole app.
 *
 * The stored values are low/normal/high/urgent; staff and reporting call them
 * Low/Medium/High/Critical. Relabelled here rather than migrated: renaming an
 * enum would rewrite every existing ticket for a wording change, and nothing
 * outside the display layer cares what they are called.
 */
export const PRIORITY_LABEL: Record<TicketPriorityValue, string> = {
  low: "Low",
  normal: "Medium",
  high: "High",
  urgent: "Critical",
};

/** Most urgent first — the order reporting and dropdowns present them in. */
export const PRIORITY_ORDER: TicketPriorityValue[] = ["urgent", "high", "normal", "low"];

export const PRIORITY_OPTIONS = PRIORITY_ORDER.map((value) => ({ value, label: PRIORITY_LABEL[value] }));

export function priorityLabel(value: string): string {
  return PRIORITY_LABEL[value as TicketPriorityValue] ?? value;
}
