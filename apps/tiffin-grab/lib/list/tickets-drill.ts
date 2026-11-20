/**
 * Drill-through links from the Tickets KPI cards. Status may be a comma list;
 * the queue splits it the same way complaint analytics does. `overdue` is the
 * queue's own pill, not a stored status.
 */

import { setDateParams, type WithUrlDates } from "@/lib/dates/range-params";

export function ticketsListHref(
  sp: { from?: string; to?: string } & WithUrlDates,
  opts: { status?: string } = {},
): string {
  const qs = new URLSearchParams();
  setDateParams(qs, sp);
  if (opts.status) qs.set("status", opts.status);
  const s = qs.toString();
  return s ? `/dashboard/tickets?${s}` : "/dashboard/tickets";
}
