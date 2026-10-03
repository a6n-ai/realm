import { turnstileKeys } from "@/lib/auth/captcha";

// The browser asks for the public site key at runtime: NEXT_PUBLIC_* would be
// baked in at `next build`, where the SSM keys aren't available.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ siteKey: turnstileKeys()?.siteKey ?? null });
}
