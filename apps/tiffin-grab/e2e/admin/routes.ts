/**
 * Admin feature surface — one entry per sidebar / settings / nested hub page.
 * Used by smoke specs so every admin feature has at least a load regression.
 */
export type AdminRoute = {
  /** Stable test id / name */
  id: string;
  path: string;
  /** Heading text (or regex) expected on a healthy page */
  heading: string | RegExp;
  /** Optional: path after redirects settle */
  finalPath?: string | RegExp;
};

export const ADMIN_SIDEBAR_ROUTES: AdminRoute[] = [
  { id: "overview", path: "/dashboard", heading: "Overview" },
  { id: "inquiries", path: "/dashboard/inquiries", heading: "Inquiries" },
  { id: "orders", path: "/dashboard/orders", heading: "Orders" },
  { id: "dispatch", path: "/dashboard/dispatch", heading: "Dispatch" },
  { id: "dispatch-completions", path: "/dashboard/dispatch/completions", heading: /Dispatch/i },
  { id: "dispatch-drivers", path: "/dashboard/dispatch/drivers", heading: /Dispatch/i },
  { id: "dispatch-stale", path: "/dashboard/dispatch/stale", heading: /Dispatch/i },
  { id: "customers", path: "/dashboard/customers", heading: "Customers" },
  { id: "tickets", path: "/dashboard/tickets", heading: "Tickets" },
  { id: "catalog", path: "/dashboard/catalog", heading: "Catalog" },
  { id: "menus", path: "/dashboard/menus", heading: /Weekly menus|Menus/i },
  {
    id: "wallet",
    path: "/dashboard/wallet",
    heading: /Ledger|Wallet|Coin/i,
    finalPath: /\/dashboard\/wallet\//,
  },
  {
    id: "payments",
    path: "/dashboard/payments",
    heading: /Payments/i,
    finalPath: /\/dashboard\/payments\//,
  },
  {
    id: "discounts",
    path: "/dashboard/discounts",
    heading: /Discount|Coupon|Log|Kind|Allowance/i,
    finalPath: /\/dashboard\/discounts\//,
  },
  {
    id: "notifications",
    path: "/dashboard/notifications",
    heading: /Template|Notification|Email|Log|Analytics/i,
    finalPath: /\/dashboard\/notifications\//,
  },
  { id: "users", path: "/dashboard/organization/users", heading: "Organization" },
  { id: "settings", path: "/dashboard/settings", heading: "Settings" },
  { id: "design", path: "/dashboard/design", heading: /Design/i },
  { id: "account", path: "/dashboard/account", heading: /Account|Profile/i },
];

export const ADMIN_SETTINGS_ROUTES: AdminRoute[] = [
  { id: "settings-general", path: "/dashboard/settings/general", heading: /General|Timezone|Cutoff/i },
  { id: "settings-lead-sources", path: "/dashboard/settings/lead-sources", heading: /Lead sources|Sources/i },
  {
    id: "settings-lead-assignment",
    path: "/dashboard/settings/lead-assignment",
    heading: /Lead assignment|Assignment|Routing/i,
  },
  { id: "settings-meal-types", path: "/dashboard/settings/meal-types", heading: /Meal types|Meal/i },
  {
    id: "settings-integrations",
    path: "/dashboard/settings/integrations",
    heading: /Integrations|Plugins/i,
  },
  {
    id: "settings-payments",
    path: "/dashboard/settings/payments",
    heading: /Payment|e-Transfer|Stripe|No payment/i,
  },
  {
    id: "settings-optimoroute",
    path: "/dashboard/settings/optimoroute",
    heading: /OptimoRoute/i,
  },
];

export const ADMIN_NESTED_ROUTES: AdminRoute[] = [
  // wallet/discounts/notifications/account sub-tabs all render under one shared
  // layout.tsx PageHeader (a single h1 for the whole section) — the tab-specific
  // content is proven by expectHealthyPage's fatal-copy check, not by a per-tab h1.
  { id: "wallet-ledger", path: "/dashboard/wallet/ledger", heading: /Wallet/i },
  { id: "wallet-payouts", path: "/dashboard/wallet/payouts", heading: /Wallet/i },
  { id: "wallet-coin-rate", path: "/dashboard/wallet/coin-rate", heading: /Wallet/i },
  { id: "payments-requests", path: "/dashboard/payments/requests", heading: /Payments/i },
  { id: "payments-all", path: "/dashboard/payments/all", heading: /Payments/i },
  { id: "payments-ledger", path: "/dashboard/payments/ledger", heading: /Payments/i },
  { id: "payments-logs", path: "/dashboard/payments/logs", heading: /Payments/i },
  { id: "discount-logs", path: "/dashboard/discounts/logs", heading: /Discounts/i },
  { id: "discount-coupons", path: "/dashboard/discounts/coupons", heading: /Discounts/i },
  { id: "discount-kinds", path: "/dashboard/discounts/kinds", heading: /Discounts/i },
  {
    id: "discount-rep-allowance",
    path: "/dashboard/discounts/rep-allowance",
    heading: /Discounts/i,
  },
  {
    id: "notif-templates",
    path: "/dashboard/notifications/templates",
    heading: /Notifications/i,
  },
  { id: "notif-logs", path: "/dashboard/notifications/logs", heading: /Notifications/i },
  {
    id: "notif-analytics",
    path: "/dashboard/notifications/analytics",
    heading: /Notifications/i,
  },
  { id: "catalog-dishes", path: "/dashboard/catalog/dishes", heading: /Dish/i },
  { id: "catalog-plans", path: "/dashboard/catalog/plans", heading: /Plan/i },
  { id: "catalog-meal-sizes", path: "/dashboard/catalog/meal-sizes", heading: /Meal size/i },
  {
    id: "catalog-dish-categories",
    path: "/dashboard/catalog/dish-categories",
    heading: /Categor/i,
  },
  {
    // Its own static page (not the dynamic [resource] route the other catalog
    // entries use) grouping frequencies/duration-packages/delivery-zones under
    // one "Delivery settings" title.
    id: "catalog-delivery-frequencies",
    path: "/dashboard/catalog/delivery-frequencies",
    heading: /Delivery settings/i,
  },
  {
    id: "catalog-duration-packages",
    path: "/dashboard/catalog/duration-packages",
    heading: /Duration/i,
  },
  {
    id: "catalog-delivery-zones",
    path: "/dashboard/catalog/delivery-zones",
    heading: /Zone/i,
  },
  {
    id: "catalog-pricing-tiers",
    path: "/dashboard/catalog/pricing-tiers",
    heading: /Pricing|Tier/i,
  },
  { id: "catalog-addons", path: "/dashboard/catalog/addons", heading: /Add-?on/i },
  // Shared layout.tsx PageHeader across all /account/* sub-pages, same as wallet/discounts/notifications above.
  { id: "account-profile", path: "/dashboard/account/profile", heading: /Account/i },
  { id: "account-security", path: "/dashboard/account/security", heading: /Account/i },
];

export const ALL_ADMIN_ROUTES: AdminRoute[] = [
  ...ADMIN_SIDEBAR_ROUTES,
  ...ADMIN_SETTINGS_ROUTES,
  ...ADMIN_NESTED_ROUTES,
];
