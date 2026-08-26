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
];

export const ADMIN_NESTED_ROUTES: AdminRoute[] = [
  { id: "wallet-ledger", path: "/dashboard/wallet/ledger", heading: /Ledger|Wallet/i },
  { id: "wallet-payouts", path: "/dashboard/wallet/payouts", heading: /Payout/i },
  { id: "wallet-coin-rate", path: "/dashboard/wallet/coin-rate", heading: /Coin|Rate/i },
  { id: "discount-logs", path: "/dashboard/discounts/logs", heading: /Log|Discount/i },
  { id: "discount-coupons", path: "/dashboard/discounts/coupons", heading: /Coupon/i },
  { id: "discount-kinds", path: "/dashboard/discounts/kinds", heading: /Kind/i },
  {
    id: "discount-rep-allowance",
    path: "/dashboard/discounts/rep-allowance",
    heading: /Allowance|Rep/i,
  },
  {
    id: "notif-templates",
    path: "/dashboard/notifications/templates",
    heading: /Template/i,
  },
  { id: "notif-logs", path: "/dashboard/notifications/logs", heading: /Log/i },
  {
    id: "notif-analytics",
    path: "/dashboard/notifications/analytics",
    heading: /Analytics/i,
  },
  { id: "notif-emails", path: "/dashboard/notifications/emails", heading: /Email/i },
  { id: "catalog-dishes", path: "/dashboard/catalog/dishes", heading: /Dish/i },
  { id: "catalog-plans", path: "/dashboard/catalog/plans", heading: /Plan/i },
  { id: "catalog-meal-sizes", path: "/dashboard/catalog/meal-sizes", heading: /Meal size/i },
  {
    id: "catalog-dish-categories",
    path: "/dashboard/catalog/dish-categories",
    heading: /Categor/i,
  },
  {
    id: "catalog-delivery-frequencies",
    path: "/dashboard/catalog/delivery-frequencies",
    heading: /Frequenc/i,
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
  { id: "account-profile", path: "/dashboard/account/profile", heading: /Profile/i },
  { id: "account-security", path: "/dashboard/account/security", heading: /Security|Password|PIN/i },
];

export const ALL_ADMIN_ROUTES: AdminRoute[] = [
  ...ADMIN_SIDEBAR_ROUTES,
  ...ADMIN_SETTINGS_ROUTES,
  ...ADMIN_NESTED_ROUTES,
];
