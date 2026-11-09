// The cookie card asks on the public site only. The signed-in app (/me, /dashboard) and the sign-in
// screens never load the analytics bootstrap unprompted: a visitor who never answered stays
// essential-only there, and an earlier yes (shared across tiffingrab.ca hosts) still applies.
const QUIET = ["/me", "/dashboard", "/login", "/signup", "/forgot-password", "/set-password", "/verify-email", "/magic-link", "/accept-invitation", "/lock", "/no-access"];

// The order flow (building a plan, checkout, paying) never shows a consent prompt: nothing sits on top of the
// moment someone is ordering. The question waits for the rest of the site or the app.
const ORDER_FLOW = ["/subscribe", "/checkout", "/me/renew", "/me/trial", "/activate"];
const under = (path: string, p: string) => path === p || path.startsWith(`${p}/`);

export function inOrderFlow(path: string): boolean {
  return ORDER_FLOW.some((p) => under(path, p));
}

export function consentCardOn(path: string): boolean {
  return !QUIET.some((p) => under(path, p)) && !inOrderFlow(path);
}
