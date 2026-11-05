/**
 * Drill-through links from Customers KPI cards into the same listing filters.
 *
 * Counts and the list must share one definition of "has orders": non-cancelled
 * order rows. See `listCustomersPage` customerType and the CustomersStats query.
 */

export type CustomerTypeFilter = "none" | "ordered" | "new" | "repeat";

/** Build `/dashboard/customers` with the date window and optional customerType. */
export function customersListHref(
  sp: { from?: string; to?: string },
  opts: { customerType?: CustomerTypeFilter; from?: string; to?: string } = {},
): string {
  const qs = new URLSearchParams();
  const from = opts.from ?? sp.from;
  const to = opts.to ?? sp.to;
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (opts.customerType) qs.set("customerType", opts.customerType);
  const s = qs.toString();
  return s ? `/dashboard/customers?${s}` : "/dashboard/customers";
}
