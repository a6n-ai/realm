import { Role } from "@realm/commons";

const ADMIN_HOME = "/dashboard";
const CUSTOMER_HOME = "/me";
const NO_ACCESS = "/no-access";

/**
 * `callbackUrl` arrives from the query string, so it is attacker-controlled.
 * A leading "//" or "/\" is a protocol-relative URL the browser treats as
 * off-site, which is why a plain startsWith("/") check is not enough.
 */
function isSameSitePath(candidate: string): boolean {
  return candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.startsWith("/\\");
}

/**
 * `member` is invitable but every page under /dashboard still calls
 * requireAdmin, so its only reachable destination is the /no-access explainer.
 */
function homeFor(role: string | null | undefined): string {
  if (role === Role.ADMIN) return ADMIN_HOME;
  if (role === Role.MEMBER) return NO_ACCESS;
  return CUSTOMER_HOME;
}

/**
 * Where a freshly signed-in session belongs. A customer bounced to /dashboard
 * gets redirected straight back to /login, so honouring a callback the role
 * cannot reach produces a loop, not a destination.
 */
export function landingPathFor(role: string | null | undefined, callbackUrl?: string | null): string {
  const home = homeFor(role);
  if (!callbackUrl || !isSameSitePath(callbackUrl)) return home;

  const reachable = callbackUrl === home || callbackUrl.startsWith(`${home}/`);
  return reachable ? callbackUrl : home;
}
