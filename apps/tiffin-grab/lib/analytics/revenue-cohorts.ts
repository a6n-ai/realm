/** Labels and colors for the renewals / new plans / trials split; the amounts come from SQL (money.ts). */

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
