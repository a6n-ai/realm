"use client";

// Visitor-picked franchise override, read by proxy.ts as a fallback tenant
// resolver (URL segment still wins). Shared by the location popup and the
// /locations picker so both write the exact same cookie shape.
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
