import { Role } from "@foundry/commons";

const ADMIN_HOME = "/dashboard";
const CUSTOMER_HOME = "/me";

// Browsers strip tab/CR/LF and treat "\\" as "/", so any control char, space or backslash could turn "/x" into "//host".
const SAME_SITE_PATH = /^\/(?![/\\])[^\x00-\x20\x7f\\]*$/;

function isSameSitePath(candidate: string): boolean {
  return SAME_SITE_PATH.test(candidate);
}

/** The sign-in return target from the URL, only when it is a same-site relative path. */
export function safeCallback(params: { get(name: string): string | null }): string | null {
  const raw = params.get("callbackUrl") ?? params.get("next");
  return raw && isSameSitePath(raw) ? raw : null;
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

/** /signup link that keeps the sanitized return target, so a new family lands back on the session they picked. */
export function signupHref(next: string | null, extra?: Record<string, string>): string {
  const params = new URLSearchParams();
  if (next && isSameSitePath(next)) params.set("next", next);
  for (const [key, value] of Object.entries(extra ?? {})) params.set(key, value);
  const query = params.toString();
  return query ? `/signup?${query}` : "/signup";
}

/** Where a brand-new customer goes after signing up: the target they came for when they may reach it, else the welcome page. */
export function afterSignupPath(next: string | null): string {
  if (!next) return "/me/welcome";
  const target = landingPathFor("user", next);
  return target === next ? next : "/me/welcome";
}
