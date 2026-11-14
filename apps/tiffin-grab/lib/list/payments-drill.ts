/**
 * Drill-through links from Payments KPI cards into the tab's filtered list.
 * Only use when the card's predicate is exactly expressible as list facets.
 */

export const PAYMENTS_TABS = [
  { key: "requests", label: "E-transfer", href: "/dashboard/payments/requests" },
  { key: "stripe", label: "Stripe", href: "/dashboard/payments/stripe" },
  { key: "all", label: "All payments", href: "/dashboard/payments/all" },
  { key: "ledger", label: "Ledger", href: "/dashboard/payments/ledger" },
  { key: "logs", label: "Provider logs", href: "/dashboard/payments/logs" },
] as const;

export type PaymentsTabPath = (typeof PAYMENTS_TABS)[number]["key"];

const PATH = Object.fromEntries(PAYMENTS_TABS.map((t) => [t.key, t.href])) as Record<PaymentsTabPath, string>;

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
