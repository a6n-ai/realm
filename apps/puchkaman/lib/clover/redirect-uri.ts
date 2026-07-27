/** OAuth callback registered in the Clover Developer Dashboard. */
export function cloverOAuthRedirectUri(): string {
  const base = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  if (!base) {
    throw new Error("BETTER_AUTH_URL is required for Clover OAuth redirect");
  }
  return `${base}/api/integrations/clover/callback`;
}
