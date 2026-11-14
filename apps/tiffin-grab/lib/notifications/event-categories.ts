// Leaf module: no imports, so the client template list can use it.
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
