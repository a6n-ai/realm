export const FINANCES_TABS = ["coins", "payments", "transactions"] as const;
export type FinancesTab = (typeof FINANCES_TABS)[number];

export function parseFinancesTab(raw: string | undefined): FinancesTab {
  if (raw === "payments" || raw === "transactions") return raw;
  return "coins";
}

export function financesHref(tab: FinancesTab): string {
  return tab === "coins" ? "/me/wallet" : `/me/wallet?tab=${tab}`;
}
