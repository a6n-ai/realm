import type { CostPart, ProfitabilityKpis } from "./profitability";

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

/**
 * Cash collected, less deductions (tax, and money for tiffins not delivered in this range), gives
 * revenue; then each non-zero cost as a negative step, ending at the profit the stat card shows.
 */
export function buildProfitWaterfall(k: Pick<ProfitabilityKpis, "revenue" | "profit" | "cashCollected">, costParts: CostPart[]): WaterfallData {
  const deductions = Math.round((k.revenue - k.cashCollected) * 100) / 100;
  return {
    start: { label: "Cash collected", value: k.cashCollected, fill: "var(--chart-3)" },
    steps: [
      ...(deductions !== 0 ? [{ label: "Deductions", value: deductions, fill: DEDUCTION_FILL }] : []),
      { label: "Revenue", value: k.revenue, total: true },
      ...costParts.filter((c) => c.value !== 0).map((c) => ({ label: c.label, value: -c.value })),
    ],
    end: { label: "Profit", value: k.profit },
  };
}
