// Cloudflare Turnstile on every endpoint that mails a code or checks a password.
// Off until BOTH keys are set (SSM /tiffin-grab/prod/TURNSTILE_SITE_KEY and
// TURNSTILE_SECRET_KEY), so local dev and a half-configured deploy keep working.
// Matched by substring: "/request-password-reset" also covers the email-otp variant.
export const CAPTCHA_ENDPOINTS = ["/sign-in/email", "/email-otp/send-verification-otp", "/request-password-reset"];

export function turnstileKeys(): { siteKey: string; secretKey: string } | null {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  return siteKey && secretKey ? { siteKey, secretKey } : null;
}
