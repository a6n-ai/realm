/** Each tab shows only when the viewer holds the permissions its page reads. Shared by the tab bar and the index redirect. */
export const TAB_PERMS: [string, Record<string, string[]>][] = [
  ["/dashboard/analytics/overview", { finance: ["read"], order: ["read"], customer: ["read"], ticket: ["read"] }],
  ["/dashboard/analytics/leads", { inquiry: ["read"] }],
  ["/dashboard/analytics/revenue", { finance: ["read"] }],
  ["/dashboard/analytics/profitability", { finance: ["read"] }],
  ["/dashboard/analytics/products", { order: ["read"] }],
  ["/dashboard/analytics/customers", { customer: ["read"], order: ["read"] }],
  ["/dashboard/analytics/operations", { delivery: ["read"] }],
  ["/dashboard/analytics/complaints", { ticket: ["read"] }],
  ["/dashboard/analytics/employees", { finance: ["read"] }],
];

/** First tab the viewer can open, or the overview when none is (the layout then shows its no-access state). */
export async function firstAllowedTab(
  tabs: [string, Record<string, string[]>][],
  can: (perms: Record<string, string[]>) => Promise<boolean>,
): Promise<string> {
  for (const [href, perms] of tabs) if (await can(perms)) return href;
  return tabs[0]![0];
}
