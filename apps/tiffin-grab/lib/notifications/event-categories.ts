// Plain module (no db/schema import) so the client template list can use it.
export const EVENT_CATEGORIES = ["orders", "payments", "wallet", "inquiries", "support", "account", "marketing"] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<EventCategory, string> = {
  orders: "Orders",
  payments: "Payments",
  wallet: "Wallet",
  inquiries: "Inquiries",
  support: "Support",
  account: "Account & security",
  marketing: "Marketing",
};

const PREFIX: [string, EventCategory][] = [
  ["order_", "orders"],
  ["payment_", "payments"],
  ["refund_", "payments"],
  ["wallet_", "wallet"],
  ["inquiry_", "inquiries"],
  ["ticket_", "support"],
];

const EXACT: Record<string, EventCategory> = {
  menu_released: "marketing",
  review_nudge: "marketing",
};

/** Unlisted events (auth emails, invites, signup) fall into Account & security. */
export function eventCategory(event: string): EventCategory {
  return EXACT[event] ?? PREFIX.find(([p]) => event.startsWith(p))?.[1] ?? "account";
}
