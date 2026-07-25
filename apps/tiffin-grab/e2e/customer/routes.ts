/** Customer app (`/me/*`) routes — require customer session. */
export type CustomerRoute = {
  id: string;
  path: string;
  heading: string | RegExp;
};

export const CUSTOMER_ROUTES: CustomerRoute[] = [
  { id: "home", path: "/me", heading: /home|week|meal|subscription|tiffin|menu/i },
  { id: "menu", path: "/me/menu", heading: /menu/i },
  { id: "meals", path: "/me/meals", heading: /meal/i },
  { id: "deliveries", path: "/me/deliveries", heading: /deliver/i },
  { id: "wallet", path: "/me/wallet", heading: /finance|wallet|coin|bill|transaction/i },
  { id: "wallet-coins", path: "/me/wallet?tab=coins", heading: /finance|wallet|coin|bill|transaction/i },
  { id: "account", path: "/me/account", heading: /account|profile|section/i },
  { id: "support", path: "/me/support", heading: /support|ticket/i },
  { id: "support-new", path: "/me/support/new", heading: /support|ticket|new|create/i },
  { id: "profile", path: "/me/profile", heading: /profile/i },
  { id: "security", path: "/me/security", heading: /security|password|pin/i },
  { id: "address", path: "/me/address", heading: /address/i },
  { id: "dietary", path: "/me/dietary", heading: /diet/i },
  { id: "delivery-notes", path: "/me/delivery-notes", heading: /delivery|note/i },
  { id: "notifications", path: "/me/notifications", heading: /notif/i },
  { id: "contact", path: "/me/contact", heading: /contact|email|phone/i },
];
