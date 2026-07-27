/**
 * OAuth callback URL registered in the Clover Developer Dashboard.
 * Uses the app's public origin (`BETTER_AUTH_URL` / `NEXT_PUBLIC_BETTER_AUTH_URL`).
 */
export function cloverOAuthRedirectUri(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const base = (env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!base) {
    throw new Error("BETTER_AUTH_URL is required for Clover OAuth redirect");
  }
  return `${base}/api/integrations/clover/callback`;
}
