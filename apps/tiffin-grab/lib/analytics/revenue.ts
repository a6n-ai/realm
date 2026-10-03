/**
 * Revenue math, kept pure so the waterfall can be tested without a database.
 *
 * Every number is derived from the order's immutable pricing snapshot, scaled by
 * the share of the order total that one payment covers:
 *
 *   gross sales (list price: tiffins + add-ons + delivery, before discounts)
 * − discounts   (catalog cadence discounts, coupons, coins)
 * = net sales   (excludes tax — tax is owed to the government, not earned)
 * + tax
 * = net collected (what settled payments actually brought in)
 *
 * A refund flips the payment row from paid to refunded. Refunded payments drop out
 * of sales and out of the trend, and are reported once under `refunded`. Discount
 * lines come from the pricing snapshot (catalog, coupon, coins), scaled to the
 * discount that was actually applied — never more than the list price.
 */

import {
  currentMonth,
  eachDateInclusive,
  isoDateInZone,
  monthBounds,
  periodKey,
  periodLabel,
  round2,
  type Grain,
} from "./profitability";

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

export type RevenuePaymentRow = {
  orderId: string;
  status: string;
  method: string;
  amount: number;
  /** Epoch ms the money moved: capturedAt, falling back to createdAt. */
  at: number;
  orderTotal: number;
  snapshot: unknown;
};

export type DiscountSource = "catalog" | "coupon" | "coins" | "other";

export type DiscountLine = { source: DiscountSource; label: string; amount: number; orders: number };

export type RevenueKpis = {
  grossSales: number;
  discounts: number;
  discountRatePct: number | null;
  netSales: number;
  tax: number;
  collected: number;
  refunded: number;
  netCollected: number;
  orders: number;
  avgOrderValue: number | null;
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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The date the user picked is a calendar day, stored as YYYY-MM-DD. Epoch values
 * are the older picker payload: an instant, converted into the business timezone.
 * No bounds means month-to-date through today in that timezone.
 */
export function resolveRevenueBounds(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  timezone: string,
  now: number,
): { from: string; to: string } {
  const today = isoDateInZone(now, timezone);
  const one = (raw: string | undefined, fallback: string) => {
    if (!raw) return fallback;
    if (ISO_DATE.test(raw)) return raw;
    const n = Number(raw);
    return Number.isFinite(n) ? isoDateInZone(n, timezone) : fallback;
  };
  if (!fromRaw && !toRaw) return { from: monthBounds(currentMonth(timezone, now)).from, to: today };
  const from = one(fromRaw, "2000-01-01");
  const to = one(toRaw, today);
  return from <= to ? { from, to } : { from: to, to: from };
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

export function summarizeRevenue(input: {
  from: string;
  to: string;
  timezone: string;
  payments: RevenuePaymentRow[];
  pending: { amount: number; at: number }[];
}): RevenueSummary {
  const { from, to, timezone } = input;
  const grain = grainForRange(from, to);
  const inRange = (ms: number) => {
    const day = isoDateInZone(ms, timezone);
    return day >= from && day <= to ? day : null;
  };

  const buckets = new Map<string, { netSales: number; collected: number }>();
  for (const day of eachDateInclusive(from, to)) {
    const key = periodKey(day, grain);
    if (!buckets.has(key)) buckets.set(key, { netSales: 0, collected: 0 });
  }

  const byMethod = new Map<string, number>();
  const discountLines = new Map<string, DiscountLine & { orderIds: Set<string> }>();
  const addDiscount = (source: DiscountSource, label: string, amount: number, orderId: string) => {
    if (amount <= 0) return;
    const key = `${source}:${label}`;
    const line = discountLines.get(key) ?? { source, label, amount: 0, orders: 0, orderIds: new Set<string>() };
    line.amount += amount;
    line.orderIds.add(orderId);
    discountLines.set(key, line);
  };

  const settledOrders = new Set<string>();
  let grossSales = 0;
  let discounts = 0;
  let netSales = 0;
  let tax = 0;
  let collected = 0;
  let refunded = 0;

  for (const p of input.payments) {
    const day = inRange(p.at);
    if (!day) continue;
    const bucket = buckets.get(periodKey(day, grain))!;

    collected += p.amount;
    if (p.status === "refunded") {
      refunded += p.amount;
      continue;
    }
    if (!(SETTLED_STATUSES as readonly string[]).includes(p.status)) continue;

    // One order can be settled by more than one payment; each carries its share.
    const share = p.orderTotal > 0 ? p.amount / p.orderTotal : 1;
    const snap = parseSnapshot(p.snapshot);
    const payTax = snap.taxTotal * share;
    const payNet = p.amount - payTax;
    // No subtotal on file (legacy rows): treat the payment, minus tax, as the list price.
    const payGross = snap.subtotal == null ? payNet : snap.subtotal * share;
    // Floored at the list price: a discount that would take the order below $0
    // was never actually given, so it must not be reported in full.
    const effective = snap.subtotal == null ? 0 : Math.max(0, payGross - payNet);

    tax += payTax;
    netSales += payNet;
    grossSales += payGross;
    discounts += effective;
    bucket.netSales += payNet;
    bucket.collected += p.amount;
    byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
    settledOrders.add(p.orderId);

    if (effective <= 0) continue;
    const parts = snap.adjustments.map((a) => ({ ...classifyAdjustment(a), weight: a.amount * share }));
    const amounts = apportion(effective, parts.map((part) => part.weight));
    if (amounts.length === 0) {
      addDiscount("other", "Discount", effective, p.orderId);
    } else {
      parts.forEach((part, i) => addDiscount(part.source, part.label, amounts[i] ?? 0, p.orderId));
    }
  }

  let pendingAmount = 0;
  let pendingCount = 0;
  for (const p of input.pending) {
    if (!inRange(p.at)) continue;
    pendingAmount += p.amount;
    pendingCount += 1;
  }

  const orders = settledOrders.size;
  return {
    from,
    to,
    grain,
    kpis: {
      grossSales: round2(grossSales),
      discounts: round2(discounts),
      discountRatePct: grossSales > 0 ? round2((discounts / grossSales) * 100) : null,
      netSales: round2(netSales),
      tax: round2(tax),
      collected: round2(collected),
      refunded: round2(refunded),
      netCollected: round2(collected - refunded),
      orders,
      avgOrderValue: orders > 0 ? round2(netSales / orders) : null,
      pendingAmount: round2(pendingAmount),
      pendingCount,
    },
    trend: [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, b]) => ({
        period: periodLabel(key, grain),
        netSales: round2(b.netSales),
        collected: round2(b.collected),
      })),
    byMethod: [...byMethod.entries()]
      .map(([method, amount]) => ({ method: methodLabel(method), key: method, amount: round2(amount) }))
      .sort((a, b) => b.amount - a.amount),
    discounts: [...discountLines.values()]
      .map(({ orderIds, ...line }) => ({ ...line, amount: round2(line.amount), orders: orderIds.size }))
      .sort((a, b) => b.amount - a.amount),
  };
}
