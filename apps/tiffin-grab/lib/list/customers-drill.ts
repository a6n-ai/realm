/**
 * Drill-through links from Customers KPI cards into the same listing filters.
 *
 * Counts and the list must share one definition of "has orders": non-cancelled
 * order rows. See `listCustomersPage` customerType and the CustomersStats query.
 */

import { setDateParams, type WithUrlDates } from "@/lib/dates/range-params";

export type CustomerTypeFilter = "none" | "ordered" | "new" | "repeat";

export function customersListHref(
  sp: { from?: string; to?: string } & WithUrlDates,
  opts: { customerType?: CustomerTypeFilter; from?: string; to?: string; dateQs?: string } = {},
): string {
  const qs = new URLSearchParams();
  setDateParams(qs, opts.from || opts.to || opts.dateQs != null ? opts : sp);
  if (opts.customerType) qs.set("customerType", opts.customerType);
  const s = qs.toString();
  return s ? `/dashboard/customers?${s}` : "/dashboard/customers";
}
