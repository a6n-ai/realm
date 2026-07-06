export type RouteSpec = { path: string; label: string; params?: Record<string, string> };

export const ROUTES: RouteSpec[] = [
  // dashboard — list/table pages
  { path: "/dashboard", label: "dashboard-overview" },
  { path: "/dashboard/customers", label: "customers-list" },
  { path: "/dashboard/orders", label: "orders-list" },
  { path: "/dashboard/inquiries", label: "inquiries-list" },
  { path: "/dashboard/users", label: "users-list" },
  { path: "/dashboard/meals", label: "meals" },
  { path: "/dashboard/menus", label: "menus" },
  { path: "/dashboard/catalog", label: "catalog" },
  { path: "/dashboard/support", label: "support-list" },
  { path: "/dashboard/tickets", label: "tickets-list" },
  { path: "/dashboard/wallet/ledger", label: "wallet-ledger" },
  { path: "/dashboard/wallet/payouts", label: "wallet-payouts" },
  { path: "/dashboard/notifications/logs", label: "notif-logs" },
  { path: "/dashboard/notifications/templates", label: "notif-templates" },
  { path: "/dashboard/notifications/analytics", label: "notif-analytics" },
  { path: "/dashboard/discounts", label: "discounts" },
  { path: "/dashboard/discounts/coupons", label: "discount-coupons" },
  { path: "/dashboard/discounts/kinds", label: "discount-kinds" },
  { path: "/dashboard/discounts/logs", label: "discount-logs" },
  // dashboard — form/detail pages
  { path: "/dashboard/settings/general", label: "settings-general" },
  { path: "/dashboard/settings/lead-assignment", label: "settings-lead-assignment" },
  { path: "/dashboard/settings/lead-sources", label: "settings-lead-sources" },
  { path: "/dashboard/settings/meal-types", label: "settings-meal-types" },
  { path: "/dashboard/discounts/rep-allowance", label: "rep-allowance" },
  { path: "/dashboard/wallet/coin-rate", label: "coin-rate" },
  { path: "/dashboard/support/new", label: "support-new" },
  // dashboard — account section
  { path: "/dashboard/account", label: "account" },
  { path: "/dashboard/account/profile", label: "account-profile" },
  { path: "/dashboard/account/contact", label: "account-contact" },
  { path: "/dashboard/account/address", label: "account-address" },
  { path: "/dashboard/account/security", label: "account-security" },
  { path: "/dashboard/account/dietary", label: "account-dietary" },
  { path: "/dashboard/account/delivery-notes", label: "account-delivery-notes" },
  { path: "/dashboard/account/notifications", label: "account-notifications" },
  // dashboard — dynamic detail
  // seed.sql seeds no customers/staff/orders/inquiries/tickets rows (they're
  // created via the app, not the SQL seed) — no usable id exists, so these stay
  // "SAMPLE" best-effort placeholders.
  { path: "/dashboard/customers/[id]", label: "customer-detail", params: { id: "SAMPLE" } }, // FIXME: no seed value found
  { path: "/dashboard/orders/[id]", label: "order-detail", params: { id: "SAMPLE" } }, // FIXME: no seed value found
  { path: "/dashboard/inquiries/[id]", label: "inquiry-detail", params: { id: "SAMPLE" } }, // FIXME: no seed value found
  { path: "/dashboard/support/[id]", label: "support-detail", params: { id: "SAMPLE" } }, // FIXME: no seed value found
  { path: "/dashboard/tickets/[id]", label: "ticket-detail", params: { id: "SAMPLE" } }, // FIXME: no seed value found
  // "dishes" is a real resource key from resource-config.ts, seeded with rows
  // (Dal Tadka, Paneer Butter Masala, ...) in db/seed.sql.
  { path: "/dashboard/catalog/[resource]", label: "catalog-resource", params: { resource: "dishes" } },
  // "signup" is a real app_event enum value; db/seed.sql seeds an event_payout
  // row for every app_event value (enum_range(null::app_event)).
  { path: "/dashboard/notifications/templates/[event]", label: "template-event", params: { event: "signup" } },
  { path: "/dashboard/settings", label: "settings" },
  { path: "/dashboard/notifications", label: "notifications" },
  { path: "/dashboard/wallet", label: "wallet" },
  { path: "/dashboard/design", label: "design" },
  // auth
  { path: "/login", label: "login" },
  { path: "/signup", label: "signup" },
  { path: "/forgot-password", label: "forgot-password" },
  { path: "/reset-password", label: "reset-password" },
  { path: "/verify-email", label: "verify-email" },
  { path: "/lock", label: "lock" },
  // marketing
  { path: "/", label: "marketing-home" },
  { path: "/about", label: "marketing-about" },
  { path: "/contact", label: "marketing-contact" },
  { path: "/faq", label: "marketing-faq" },
  { path: "/how-it-works", label: "marketing-how-it-works" },
  { path: "/menu", label: "marketing-menu" },
  { path: "/menu/weekly", label: "marketing-menu-weekly" },
  { path: "/pricing", label: "marketing-pricing" },
  // public
  { path: "/checkout", label: "checkout" },
  { path: "/subscribe", label: "subscribe" },
  // seed.sql seeds no deployments (they're created from activated orders/subscriptions
  // via the app, not the SQL seed) — no usable id exists.
  { path: "/activate/[deploymentId]", label: "activate", params: { deploymentId: "SAMPLE" } }, // FIXME: no seed value found
];

export function resolve(r: RouteSpec): string {
  let p = r.path;
  for (const [k, v] of Object.entries(r.params ?? {})) p = p.replace(`[${k}]`, v);
  return p;
}
