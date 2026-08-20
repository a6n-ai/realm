/**
 * Public / marketing / auth routes — no session required.
 */
export type PublicRoute = {
  id: string;
  path: string;
  heading?: string | RegExp;
};

export const PUBLIC_ROUTES: PublicRoute[] = [
  { id: "home", path: "/", heading: /tiffin|home|fresh|meal|grab/i },
  { id: "login", path: "/login", heading: /sign in|log in|welcome|email/i },
  { id: "signup", path: "/signup", heading: /sign up|create|register|email/i },
  { id: "forgot-password", path: "/forgot-password", heading: /forgot|reset|password|email/i },
  { id: "subscribe", path: "/subscribe", heading: /subscribe|plan|order|wizard|meal|tiffin/i },
  { id: "checkout", path: "/checkout", heading: /checkout|order|address|pay|subscribe|meal/i },
  { id: "menu", path: "/menu", heading: /menu/i },
  { id: "menu-weekly", path: "/menu/weekly", heading: /menu|week/i },
  { id: "pricing", path: "/pricing", heading: /how|work|pric/i },
  { id: "contact", path: "/contact", heading: /contact/i },
];
