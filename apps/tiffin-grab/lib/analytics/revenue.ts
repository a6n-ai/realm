/**
 * Pure revenue helpers: status/method labels, chart grain and discount lines.
 * Revenue totals themselves come from SQL (lib/services/analytics/metrics/money.ts).
 * Discount lines come from each order's pricing snapshot (catalog, coupon, coins), scaled to the
 * share of the order a payment covers and capped at the list price.
 */

import { eachDateInclusive, round2, type Grain } from "./profitability";

export const SETTLED_STATUSES = ["paid", "simulated_paid"] as const;
export const PENDING_STATUSES = ["awaiting_payment", "pending_verification"] as const;

/** Display order for the payments-by-status breakdown. Unknown statuses sort last. */
export const PAYMENT_STATUS_ORDER = [
  "paid",
  "simulated_paid",
  "awaiting_payment",
  "pending_verification",
  "pending",
  "rejected",
  "refunded",
] as const;

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  paid: "Paid",
  simulated_paid: "Simulated",
  awaiting_payment: "Awaiting payment",
  pending_verification: "Needs review",
  pending: "Pending",
  rejected: "Rejected",
  refunded: "Refunded",
};

export type PaymentStatusSlice = {
  status: string;
  label: string;
  count: number;
  amount: number;
};

/** Drop empty statuses and keep a stable order so the breakdown does not jump around. */
export function presentPaymentStatuses(
  rows: { status: string; count: number; amount: number }[],
): PaymentStatusSlice[] {
  const rank = (status: string) => {
    const i = PAYMENT_STATUS_ORDER.indexOf(status as (typeof PAYMENT_STATUS_ORDER)[number]);
    return i === -1 ? PAYMENT_STATUS_ORDER.length : i;
  };
  return rows
    .filter((r) => r.count > 0)
    .map((r) => ({
      status: r.status,
      label: PAYMENT_STATUS_LABEL[r.status] ?? r.status,
      count: r.count,
      amount: round2(Number(r.amount)),
    }))
    .sort((a, b) => rank(a.status) - rank(b.status) || a.label.localeCompare(b.label));
}

export type DiscountSource = "catalog" | "coupon" | "coins" | "other";

export type DiscountLine = { source: DiscountSource; label: string; amount: number; orders: number };

export type RevenueKpis = {
  /** Captured payments before refunds, including tax (surcharge excluded). */
  gross: number;
  /** Net revenue: ex tax and surcharge, after refunds. */
  netRevenue: number;
  /** Tax still held on the net-of-refunds amount. */
  tax: number;
  refunds: number;
  /** Refunds on the paid basis; netCollected = gross - this. */
  refundsExSurcharge: number;
  unlinkedRefunds: number;
  surcharge: number;
  /** gross minus refunds. */
  netCollected: number;
  payments: number;
  /** Orders with a settled payment in the range. */
  orders: number;
  avgOrderValue: number | null;
  /** List price of those orders before discounts, excl. tax. */
  listPrice: number;
  discounts: number;
  discountRatePct: number | null;
  pendingAmount: number;
  pendingCount: number;
};

export type RevenueTrendPoint = { period: string; netSales: number; collected: number };

export type RevenueSummary = {
  from: string;
  to: string;
  grain: Grain;
  kpis: RevenueKpis;
  trend: RevenueTrendPoint[];
  byMethod: { method: string; key: string; amount: number }[];
  discounts: DiscountLine[];
};

type Snapshot = {
  subtotal: number | null;
  taxTotal: number;
  adjustments: { label: string; amount: number; catalog: boolean }[];
};

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Orders created before snapshots carried these fields parse to "no tax, no discounts". */
export function parseSnapshot(raw: unknown): Snapshot {
  const s = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const adjustments = Array.isArray(s.adjustments)
    ? s.adjustments.flatMap((a) => {
        if (!a || typeof a !== "object") return [];
        const line = a as Record<string, unknown>;
        const amount = num(line.amount);
        if (amount <= 0) return [];
        return [{ label: String(line.label ?? "Discount"), amount, catalog: typeof line.discountKey === "string" }];
      })
    : [];
  return {
    subtotal: s.subtotal == null ? null : num(s.subtotal),
    taxTotal: num(s.taxTotal),
    adjustments,
  };
}

/** Wide ranges read better as weeks or months than as hundreds of daily points. */
export function grainForRange(from: string, to: string): Grain {
  const days = eachDateInclusive(from, to).length;
  if (days <= 62) return "daily";
  if (days <= 190) return "weekly";
  return "monthly";
}

const METHOD_LABELS: Record<string, string> = {
  simulated: "Simulated",
  cash: "Cash",
  etransfer: "e-Transfer",
  manual: "Manual",
};

export function methodLabel(method: string): string {
  return METHOD_LABELS[method] ?? method;
}

function classifyAdjustment(line: { label: string; catalog: boolean }): { source: DiscountSource; label: string } {
  if (line.catalog) return { source: "catalog", label: line.label };
  if (/^coins\b/i.test(line.label)) return { source: "coins", label: "Coins redeemed" };
  return { source: "coupon", label: line.label };
}

/** Split `total` across `weights`, in cents, so the parts sum back to round2(total). */
function apportion(total: number, weights: number[]): number[] {
  const raw = weights.reduce((s, w) => s + w, 0);
  if (raw <= 0 || weights.length === 0) return [];
  const rounded = weights.map((w) => round2((w / raw) * total));
  const drift = round2(total - rounded.reduce((s, n) => s + n, 0));
  if (drift !== 0) {
    let i = 0;
    for (let j = 1; j < rounded.length; j++) if ((rounded[j] ?? 0) > (rounded[i] ?? 0)) i = j;
    rounded[i] = round2((rounded[i] ?? 0) + drift);
  }
  return rounded;
}

export type DiscountOrderRow = {
  orderId: string;
  /** Settled amount paid on this order in the range. */
  amount: number;
  orderTotal: number;
  snapshot: unknown;
};

/** One row per order: its settled payments in range carry their share of the order's snapshot. */
export function summarizeDiscounts(rows: DiscountOrderRow[]): {
  listPrice: number;
  discounts: number;
  lines: DiscountLine[];
  orders: number;
} {
  const lines = new Map<string, DiscountLine>();
  let listPrice = 0;
  let discounts = 0;
  for (const r of rows) {
    const share = r.orderTotal > 0 ? r.amount / r.orderTotal : 1;
    const snap = parseSnapshot(r.snapshot);
    const payNet = r.amount - snap.taxTotal * share;
    // No subtotal on file (legacy rows): treat the payment, minus tax, as the list price.
    const payGross = snap.subtotal == null ? payNet : snap.subtotal * share;
    // Floored at the list price: a discount that would take the order below $0 was never given.
    const effective = snap.subtotal == null ? 0 : Math.max(0, payGross - payNet);
    listPrice += payGross;
    discounts += effective;
    if (effective <= 0) continue;
    const parts = snap.adjustments.map((a) => ({ ...classifyAdjustment(a), weight: a.amount * share }));
    const amounts = apportion(effective, parts.map((part) => part.weight));
    const add = (source: DiscountSource, label: string, amount: number) => {
      if (amount <= 0) return;
      const key = `${source}:${label}`;
      const line = lines.get(key) ?? { source, label, amount: 0, orders: 0 };
      line.amount += amount;
      line.orders += 1;
      lines.set(key, line);
    };
    if (amounts.length === 0) add("other", "Discount", effective);
    else parts.forEach((part, i) => add(part.source, part.label, amounts[i] ?? 0));
  }
  return {
    listPrice: round2(listPrice),
    discounts: round2(discounts),
    lines: [...lines.values()].map((l) => ({ ...l, amount: round2(l.amount) })).sort((a, b) => b.amount - a.amount),
    orders: rows.length,
  };
}
