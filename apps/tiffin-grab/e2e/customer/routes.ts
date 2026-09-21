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
  { id: "support", path: "/me/support", heading: /support|ticket|help/i },
  { id: "support-new", path: "/me/support/new", heading: /support|ticket|new|create/i },
  { id: "profile", path: "/me/account?section=profile", heading: /your account|profile|security|address|dietary|delivery notes|notifications|phone/i },
  { id: "security", path: "/me/account?section=security", heading: /your account|profile|security|address|dietary|delivery notes|notifications|phone/i },
  { id: "address", path: "/me/account?section=address", heading: /your account|profile|security|address|dietary|delivery notes|notifications|phone/i },
  { id: "dietary", path: "/me/account?section=dietary", heading: /your account|profile|security|address|dietary|delivery notes|notifications|phone/i },
  { id: "delivery-notes", path: "/me/account?section=delivery-notes", heading: /your account|profile|security|address|dietary|delivery notes|notifications|phone/i },
  { id: "notifications", path: "/me/account?section=notifications", heading: /your account|profile|security|address|dietary|delivery notes|notifications|phone/i },
  { id: "contact", path: "/me/account?section=contact", heading: /your account|profile|security|address|dietary|delivery notes|notifications|phone/i },
];
