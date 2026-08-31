import { createHmac, timingSafeEqual } from "node:crypto";
import type { ReviewNudgeStore } from "./nudge";

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * HMAC-signed, stateless unsubscribe token — no DB lookup needed to issue or
 * verify one, so a bad/missing token reveals nothing about whether the
 * address exists (the response is identical either way).
 */
export function signUnsubscribeToken(secret: string, email: string): string {
  return createHmac("sha256", secret).update(normalize(email)).digest("hex");
}

export function verifyUnsubscribeToken(secret: string, email: string, token: string): boolean {
  const expected = Buffer.from(signUnsubscribeToken(secret, email), "hex");
  let given: Buffer;
  try {
    given = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Absolute unsubscribe link for the email template. `baseUrl` is the app's own origin. */
export function buildUnsubscribeUrl(baseUrl: string, secret: string, email: string): string {
  const url = new URL("/api/review-nudge/unsubscribe", baseUrl);
  url.searchParams.set("email", normalize(email));
  url.searchParams.set("token", signUnsubscribeToken(secret, email));
  return url.toString();
}

/**
 * Shared body for each app's unsubscribe route. Idempotent (markDone
 * COALESCEs), works for a logged-out guest (no session needed — the token IS
 * the auth), and always returns the same shape regardless of whether the
 * token was valid, so the route never reveals whether an address exists.
 */
export async function handleReviewUnsubscribe(input: {
  email: string | null;
  token: string | null;
  secret: string;
  nudgeStore: ReviewNudgeStore;
}): Promise<void> {
  const { email, token, secret, nudgeStore } = input;
  if (email && token && verifyUnsubscribeToken(secret, email, token)) {
    await nudgeStore.markDone(email);
  }
}
