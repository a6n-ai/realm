/**
 * Drill-through links from the Tickets KPI cards. Status may be a comma list;
 * the queue splits it the same way complaint analytics does. `overdue` is the
 * queue's own pill, not a stored status.
 */

export function ticketsListHref(
  sp: { from?: string; to?: string },
  opts: { status?: string } = {},
): string {
  const qs = new URLSearchParams();
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  if (opts.status) qs.set("status", opts.status);
  const s = qs.toString();
  return s ? `/dashboard/tickets?${s}` : "/dashboard/tickets";
}
