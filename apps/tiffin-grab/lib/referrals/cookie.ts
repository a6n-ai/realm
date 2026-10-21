// A share link's ?ref= code rides this cookie until the friend first signs in.
// Kept dependency-free: the proxy imports it.
export const REFERRAL_COOKIE = "tg_ref";
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
export const REFERRAL_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: REFERRAL_COOKIE_MAX_AGE,
  secure: process.env.NODE_ENV === "production",
};

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
