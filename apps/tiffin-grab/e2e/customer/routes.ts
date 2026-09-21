/** Customer app (`/me/*`) routes — require customer session. */
export type CustomerRoute = {
  id: string;
  path: string;
  heading: string | RegExp;
};

export const CUSTOMER_ROUTES: CustomerRoute[] = [
  { id: "menu", path: "/me/menu", heading: /menu/i },
  { id: "meals-redirect", path: "/me/meals", heading: /trips|no plan|subscription|start/i },
  { id: "deliveries", path: "/me", heading: /trips|no plan|subscription|start/i },
  { id: "deliveries-legacy", path: "/me/deliveries", heading: /trips|no plan|subscription|start/i },
  { id: "wallet", path: "/me/wallet", heading: /finance|wallet|coin|bill|transaction/i },
  { id: "wallet-coins", path: "/me/wallet?tab=coins", heading: /finance|wallet|coin|bill|transaction/i },
  { id: "account", path: "/me/account", heading: /qa customer|account|profile/i },
  { id: "support", path: "/me/support", heading: /support|ticket/i },
  { id: "support-new", path: "/me/support/new", heading: /support|ticket|new|create/i },
  { id: "profile", path: "/me/profile", heading: /account settings/i },
  { id: "security", path: "/me/security", heading: /account settings/i },
  { id: "address", path: "/me/address", heading: /account settings/i },
  { id: "dietary", path: "/me/dietary", heading: /account settings/i },
  { id: "delivery-notes", path: "/me/delivery-notes", heading: /account settings/i },
  { id: "notifications", path: "/me/notifications", heading: /account settings/i },
  { id: "contact", path: "/me/contact", heading: /account settings/i },
];
