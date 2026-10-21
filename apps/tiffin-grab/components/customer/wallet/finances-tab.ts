export type FinancesTab = "coins" | "coupons" | "bills" | "transactions";

export function parseFinancesTab(raw: string | undefined): FinancesTab {
  if (raw === "coupons" || raw === "bills" || raw === "transactions") return raw;
  return "coins";
}
