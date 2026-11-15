import { turnstileSiteKey, turnstileSecretKey } from "@/lib/runtime/env";
// Cloudflare Turnstile on every endpoint that mails a code or checks a password.
// Off until BOTH keys are set (SSM /tiffin-grab/prod/TURNSTILE_SITE_KEY and
// TURNSTILE_SECRET_KEY), so local dev and a half-configured deploy keep working.
// Every public endpoint that mails something or checks a password. Matched by
// substring: "/request-password-reset" also covers the email-otp variant. Only
// browser HTTP requests are checked; server-side auth.api calls skip it.
export const CAPTCHA_ENDPOINTS = [
  "/sign-in/email",
  "/email-otp/send-verification-otp",
  "/request-password-reset",
  "/forget-password/email-otp", // older reset-code route, still mounted
  "/send-verification-email",
];

export function turnstileKeys(): { siteKey: string; secretKey: string } | null {
  const siteKey = turnstileSiteKey();
  const secretKey = turnstileSecretKey();
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}

// Public server actions (no HTTP endpoint for the plugin to check) verify the same token here.
// Off with the keys, like the endpoints above. Fails closed on any siteverify error.
export async function captchaPasses(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const keys = turnstileKeys();
  if (!keys) return true;
  if (!token) return false;
  const body = new FormData();
  body.set("secret", keys.secretKey);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    return ((await res.json()) as { success?: boolean }).success === true;
  } catch {
    return false;
  }
}
