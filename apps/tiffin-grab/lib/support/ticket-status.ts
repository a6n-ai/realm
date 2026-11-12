import { tickets } from "@/db/schema/tickets";

export type TicketStatusValue = (typeof tickets.status.enumValues)[number];

/** Staff wording for each stored status. The customer app words them for the customer (components/customer/support). */
export const STATUS_LABEL: Record<TicketStatusValue, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Waiting on customer",
  resolved: "Resolved",
  closed: "Closed",
};

export const STATUS_ORDER: readonly TicketStatusValue[] = ["open", "in_progress", "waiting_on_customer", "resolved", "closed"];

export const STATUS_OPTIONS = STATUS_ORDER.map((value) => ({ value, label: STATUS_LABEL[value] }));

/** Not finished: waiting on staff or on the customer. */
export const OPEN_STATUSES = ["open", "in_progress", "waiting_on_customer"] as const satisfies readonly TicketStatusValue[];

/** Waiting on staff: the only statuses that can go overdue. */
export const STAFF_TURN_STATUSES = ["open", "in_progress"] as const satisfies readonly TicketStatusValue[];

export const DONE_STATUSES = ["resolved", "closed"] as const satisfies readonly TicketStatusValue[];

export function statusLabel(value: string): string {
  return STATUS_LABEL[value as TicketStatusValue] ?? value;
}
