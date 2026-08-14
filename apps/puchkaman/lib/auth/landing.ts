import { Role } from "@realm/commons";

const STAFF_HOME = "/dashboard";
const CUSTOMER_HOME = "/me";

const isStaff = (role: string | null | undefined): boolean =>
  role === Role.ADMIN || role === Role.MEMBER;

/**
 * `callbackUrl` arrives from the query string, so it is attacker-controlled.
 * A leading "//" or "/\" is a protocol-relative URL the browser treats as
 * off-site, which is why a plain startsWith("/") check is not enough.
 */
function isSameSitePath(candidate: string): boolean {
  return candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.startsWith("/\\");
}

/**
 * Where a freshly signed-in session belongs. A customer bounced to /dashboard
 * gets redirected straight back to /login, so honouring a callback the role
 * cannot reach produces a loop, not a destination.
 */
export function landingPathFor(role: string | null | undefined, callbackUrl?: string | null): string {
  const home = isStaff(role) ? STAFF_HOME : CUSTOMER_HOME;
  if (!callbackUrl || !isSameSitePath(callbackUrl)) return home;

  const reachable = isStaff(role)
    ? callbackUrl.startsWith(STAFF_HOME)
    : callbackUrl.startsWith(CUSTOMER_HOME);
  return reachable ? callbackUrl : home;
}
