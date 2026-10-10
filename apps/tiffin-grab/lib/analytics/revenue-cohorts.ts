/**
 * Split settled net sales into renewals / new plans / trials so Overview can
 * show a cohort pie that reconciles with revenue net sales.
 */

import { isoDateInZone, round2 } from "./profitability";
import {
  parseSnapshot,
  SETTLED_STATUSES,
  type RevenuePaymentRow,
} from "./revenue";

export type RevenueCohortKey = "renewals" | "new" | "trials";

export const REVENUE_COHORT_LABEL: Record<RevenueCohortKey, string> = {
  renewals: "Renewals",
  new: "New plans",
  trials: "Trials",
};

/** Theme chart tokens — keep Overview pie segments stable across empty slices. */
export const REVENUE_COHORT_COLOR: Record<RevenueCohortKey, string> = {
  renewals: "var(--color-chart-1)",
  new: "var(--color-chart-2)",
  trials: "var(--color-chart-3)",
};

export const REVENUE_COHORT_ORDER: readonly RevenueCohortKey[] = ["renewals", "new", "trials"];

export type RevenueCohortSlice = {
  key: RevenueCohortKey;
  label: string;
  amount: number;
  count: number;
  color: string;
};

export type CohortPaymentRow = RevenuePaymentRow & {
  trialLength: number | null;
  userId: string | null;
  orderCreatedAt: number;
  /** True when this customer already had an earlier non-trial order. */
  hasPriorNonTrial: boolean;
};

/** Net sales (excl. tax) for one settled payment; null when the row is not a sale. */
export function settledPaymentNetSales(p: RevenuePaymentRow): number | null {
  if (!(SETTLED_STATUSES as readonly string[]).includes(p.status)) return null;
  const share = p.orderTotal > 0 ? p.amount / p.orderTotal : 1;
  const snap = parseSnapshot(p.snapshot);
  return p.amount - snap.taxTotal * share;
}

export function cohortForOrder(order: {
  trialLength: number | null;
  hasPriorNonTrial: boolean;
}): RevenueCohortKey {
  if (order.trialLength != null) return "trials";
  if (order.hasPriorNonTrial) return "renewals";
  return "new";
}

export function summarizeRevenueCohorts(input: {
  from: string;
  to: string;
  timezone: string;
  payments: CohortPaymentRow[];
}): { slices: RevenueCohortSlice[]; totalAmount: number; totalCount: number } {
  const { from, to, timezone } = input;
  const inRange = (ms: number) => {
    const day = isoDateInZone(ms, timezone);
    return day >= from && day <= to;
  };

  const buckets: Record<RevenueCohortKey, { amount: number; orderIds: Set<string> }> = {
    renewals: { amount: 0, orderIds: new Set() },
    new: { amount: 0, orderIds: new Set() },
    trials: { amount: 0, orderIds: new Set() },
  };

  for (const p of input.payments) {
    if (!inRange(p.at)) continue;
    const net = settledPaymentNetSales(p);
    if (net == null) continue;
    const key = cohortForOrder(p);
    buckets[key].amount += net;
    buckets[key].orderIds.add(p.orderId);
  }

  const slices = REVENUE_COHORT_ORDER.map((key) => ({
    key,
    label: REVENUE_COHORT_LABEL[key],
    amount: round2(buckets[key].amount),
    count: buckets[key].orderIds.size,
    color: REVENUE_COHORT_COLOR[key],
  }));

  return {
    slices,
    totalAmount: round2(slices.reduce((s, r) => s + r.amount, 0)),
    totalCount: slices.reduce((s, r) => s + r.count, 0),
  };
}
