import type { CostPart, ProfitabilityKpis } from "./profitability";

export type WaterfallData = {
  start: { label: string; value: number };
  steps: { label: string; value: number }[];
  end: { label: string; value: number };
};

/** Revenue, then each non-zero cost as a negative step, ending at the profit the stat card shows. */
export function buildProfitWaterfall(k: Pick<ProfitabilityKpis, "revenue" | "profit">, costParts: CostPart[]): WaterfallData {
  return {
    start: { label: "Revenue", value: k.revenue },
    steps: costParts.filter((c) => c.value !== 0).map((c) => ({ label: c.label, value: -c.value })),
    end: { label: "Profit", value: k.profit },
  };
}
