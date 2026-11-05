/**
 * Drill-through links from Payments KPI cards into the tab's filtered list.
 * Only use when the card's predicate is exactly expressible as list facets.
 */

export type PaymentsTabPath = "all" | "requests" | "stripe" | "ledger" | "logs";

const PATH: Record<PaymentsTabPath, string> = {
  all: "/dashboard/payments/all",
  requests: "/dashboard/payments/requests",
  stripe: "/dashboard/payments/stripe",
  ledger: "/dashboard/payments/ledger",
  logs: "/dashboard/payments/logs",
};

export function paymentsListHref(
  tab: PaymentsTabPath,
  sp: { from?: string; to?: string },
  opts: { status?: string; attention?: string; type?: string; kind?: string } = {},
): string {
  const qs = new URLSearchParams();
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
  if (opts.status) qs.set("status", opts.status);
  if (opts.attention) qs.set("attention", opts.attention);
  if (opts.type) qs.set("type", opts.type);
  if (opts.kind) qs.set("kind", opts.kind);
  const s = qs.toString();
  const path = PATH[tab];
  return s ? `${path}?${s}` : path;
}
