/**
 * Drill-through links from Orders KPI cards into listing filters that reproduce
 * the same rows. Pseudo-statuses (`booked`, `running`, `soon`) expand in
 * `orderStatusFilter`; `cancelledAt=1` dates by the cancel activity.
 */

export function ordersListHref(
  sp: { from?: string; to?: string } = {},
  opts: {
    status?: "booked" | "running" | "soon" | "cancelled" | "ongoing" | "pending" | "active" | "paused" | "waitlisted" | "completed";
    starts?: "0" | "7" | "14";
    /** Date the list by cancel activity (Orders Cancelled KPI). */
    cancelledAt?: boolean;
    /** Drop createdAt bounds — running / starting-soon are "right now". */
    clearDates?: boolean;
    view?: "all" | "lookout" | "payment" | "free" | "missed";
  } = {},
): string {
  const qs = new URLSearchParams();
  if (opts.view && opts.view !== "all") qs.set("view", opts.view);
  if (!opts.clearDates && !opts.cancelledAt) {
    if (sp.from) qs.set("from", sp.from);
    if (sp.to) qs.set("to", sp.to);
  }
  if (opts.cancelledAt) {
    qs.set("cancelledAt", "1");
    if (sp.from) qs.set("from", sp.from);
    if (sp.to) qs.set("to", sp.to);
  }
  if (opts.status) qs.set("status", opts.status);
  if (opts.starts) qs.set("starts", opts.starts);
  const s = qs.toString();
  return s ? `/dashboard/orders?${s}` : "/dashboard/orders";
}
