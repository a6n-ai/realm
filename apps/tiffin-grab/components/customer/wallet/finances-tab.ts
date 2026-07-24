export type FinancesTab = "coins" | "bills" | "transactions";

export function parseFinancesTab(raw: string | undefined): FinancesTab {
  if (raw === "bills" || raw === "transactions") return raw;
  return "coins";
}
