import { appOrigin } from "@/lib/runtime/env";

/** OAuth callback registered in the Clover Developer Dashboard. */
export function cloverOAuthRedirectUri(): string {
  const base = appOrigin();
  if (!base) {
    throw new Error("BETTER_AUTH_URL is required for Clover OAuth redirect");
  }
  return `${base}/api/integrations/clover/callback`;
}
