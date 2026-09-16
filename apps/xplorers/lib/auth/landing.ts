import { Role } from "@foundry/commons";

const ADMIN_HOME = "/dashboard";
const CUSTOMER_HOME = "/me";

function isSameSitePath(candidate: string): boolean {
  return candidate.startsWith("/") && !candidate.startsWith("//") && !candidate.startsWith("/\\");
}

function homeFor(role: string | null | undefined): string {
  if (role === Role.ADMIN || role === Role.MEMBER) return ADMIN_HOME;
  return CUSTOMER_HOME;
}

function pathOnly(candidate: string): string {
  const query = candidate.indexOf("?");
  return query === -1 ? candidate : candidate.slice(0, query);
}

function familyCanFinishBooking(path: string): boolean {
  return path === "/whats-on" || path.startsWith("/whats-on/");
}

export function landingPathFor(role: string | null | undefined, callbackUrl?: string | null): string {
  const home = homeFor(role);
  if (!callbackUrl || !isSameSitePath(callbackUrl)) return home;

  const path = pathOnly(callbackUrl);
  const reachable =
    path === home || path.startsWith(`${home}/`) || (home === CUSTOMER_HOME && familyCanFinishBooking(path));
  return reachable ? callbackUrl : home;
}
