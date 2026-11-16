import type { CostPart, FreeTiffinCost, ProfitabilityKpis } from "./profitability";

export type WaterfallBar = {
  label: string;
  value: number;
  /** Bar colour (a CSS colour or var); default: chart-2 for the start, good/bad by sign for steps. */
  fill?: string;
  /** A subtotal: drawn from zero to `value`, and the running total continues from it. */
  total?: boolean;
};

export type WaterfallData = {
  start: WaterfallBar;
  steps: WaterfallBar[];
  end: WaterfallBar;
};

const DEDUCTION_FILL = "var(--chart-4)";
const FREE_FILL = "var(--chart-5)";

/**
 * Cash collected, less deductions (tax, and money for tiffins not delivered in this range), gives
 * revenue; then each non-zero cost as a negative step, ending at the profit the stat card shows.
 */
export function buildProfitWaterfall(
  k: Pick<ProfitabilityKpis, "revenue" | "profit" | "cashCollected">,
  costParts: CostPart[],
  free?: FreeTiffinCost,
): WaterfallData {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const deductions = r2(k.revenue - k.cashCollected);
  // Free tiffins' cost leaves Food, Driver and Other and shows as one bar, so the end is still profit.
  const share: Record<string, number> = free ? { Food: free.food, Driver: free.driver, Other: free.other } : {};
  const freeCost = r2(Object.values(share).reduce((s, v) => s + v, 0));
  const parts = costParts.map((c) => ({ ...c, value: r2(c.value - (share[c.label] ?? 0)) }));
  return {
    start: { label: "Cash collected", value: k.cashCollected, fill: "var(--chart-3)" },
    steps: [
      ...(deductions !== 0 ? [{ label: "Deductions", value: deductions, fill: DEDUCTION_FILL }] : []),
      { label: "Revenue", value: k.revenue, total: true },
      ...(freeCost !== 0 ? [{ label: `Free tiffins (${free!.tiffins})`, value: -freeCost, fill: FREE_FILL }] : []),
      ...parts.filter((c) => c.value !== 0).map((c) => ({ label: c.label, value: -c.value })),
    ],
    end: { label: "Profit", value: k.profit },
  };
}
