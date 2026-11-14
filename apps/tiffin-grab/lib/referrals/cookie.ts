import { isProduction } from "@/lib/runtime/env";
// A share link's ?ref= code rides this cookie until the friend first signs in.
// Kept dependency-free: the proxy imports it.
export const REFERRAL_COOKIE = "tg_ref";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const REFERRAL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: REFERRAL_COOKIE_MAX_AGE,
  secure: isProduction(),
};

/** The one writer: the proxy (on ?ref=) and the wizard's rememberReferralCode both set the cookie through it. */
export function setReferralCookie(jar: { set(name: string, value: string, options: typeof REFERRAL_COOKIE_OPTIONS): unknown }, code: string): void {
  jar.set(REFERRAL_COOKIE, code, REFERRAL_COOKIE_OPTIONS);
}

export function readReferralCookie(headers: Headers | null | undefined): string | null {
  const raw = headers?.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === REFERRAL_COOKIE) return decodeURIComponent(v.join("=")) || null;
  }
  return null;
}

/** Codes are stored uppercase; people type them any way. */
export function normalizeReferralCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** Our codes: 6 of A–Z/2–9 minus look-alikes (8 for codes made before 2026-10-22).
 *  Anything else on ?ref= is a marketing tag. */
export function isReferralCodeShape(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{6}(?:[A-HJ-NP-Z2-9]{2})?$/.test(code);
}

/** The normalised code when it is one of ours, else null. */
export function parseReferralCode(raw: string | null | undefined): string | null {
  const code = normalizeReferralCode(raw ?? "");
  return isReferralCodeShape(code) ? code : null;
}

/** Live typing: drop everything outside the code alphabet, capped at the longest code. */
export function referralCodeInput(raw: string): string {
  return normalizeReferralCode(raw).replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 8);
}
