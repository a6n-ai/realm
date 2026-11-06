// The cookie card asks on the public site only. The signed-in app (/me, /dashboard) and the sign-in
// screens never load the analytics bootstrap unprompted: a visitor who never answered stays
// essential-only there, and an earlier yes (shared across tiffingrab.ca hosts) still applies.
const QUIET = ["/me", "/dashboard", "/login", "/signup", "/forgot-password", "/set-password", "/verify-email", "/magic-link", "/accept-invitation", "/lock", "/no-access"];

export function consentCardOn(path: string): boolean {
  return !QUIET.some((p) => path === p || path.startsWith(`${p}/`));
}
