// Visitor-picked franchise override, read by each app's proxy.ts as a
// fallback tenant resolver (URL segment still wins). Shared so every app's
// location popup/picker writes the exact same cookie shape. Pure functions —
// safe to import from a client component in any app.
const COOKIE_NAME = "franchise";
const COOKIE_MAX_AGE_DAYS = 365;

export function readFranchiseCookie(): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeFranchiseCookie(clientCode: string) {
  const maxAge = COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(clientCode)}; path=/; max-age=${maxAge}; samesite=lax`;
}
