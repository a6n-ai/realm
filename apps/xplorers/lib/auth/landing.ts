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

export function landingPathFor(role: string | null | undefined, callbackUrl?: string | null): string {
  const home = homeFor(role);
  if (!callbackUrl || !isSameSitePath(callbackUrl)) return home;

  const reachable = callbackUrl === home || callbackUrl.startsWith(`${home}/`);
  return reachable ? callbackUrl : home;
}
