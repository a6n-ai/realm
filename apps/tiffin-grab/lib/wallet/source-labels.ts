// One name per wallet_ledger.source_type, shared by the admin ledger and the
// customer coin log so both read the same row the same way.
const LABELS: Record<string, string> = {
  order: "Earned on order",
  order_reversal: "Earned coins taken back",
  redemption: "Spent at checkout",
  redemption_late: "Hold re-taken",
  redemption_reversal: "Returned",
  adjustment: "Staff adjustment",
  manual_broadcast: "Staff grant",
  meal_payout: "Meal payout (legacy)",
};

/** `fallback` is usually the event's own name, for sources this map doesn't know (signup, seed…). */
export function walletEntryLabel(sourceType: string, fallback?: string | null): string {
  return LABELS[sourceType] ?? fallback ?? sourceType;
}
