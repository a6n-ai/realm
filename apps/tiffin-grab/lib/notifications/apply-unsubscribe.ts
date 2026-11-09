import { handleUnsubscribe, verifyUnsubscribeToken } from "@relay/engine";
import { db } from "@/db/client";
import { unsubscribeSecret } from "@/lib/runtime/env";
import { notificationTables } from "@/lib/notifications/tables";

/**
 * One-click unsubscribe. The token IS the auth, so no session is needed — a
 * recipient who never had an account must be able to opt out.
 *
 * The HTTP response is identical whether or not the token verified and whether
 * or not the address exists, so the endpoint cannot be used to test membership.
 * `applied` is for the page only: it is true just when the caller presented a
 * valid signed link for that address, which says nothing about any list.
 *
 * Lives outside the route module: Next's webpack build rejects extra exports
 * from `route.ts`.
 */
export async function applyUnsubscribe(
  url: URL,
  source: "link" | "one-click",
): Promise<{ applied: boolean; address: string | null }> {
  const secret = unsubscribeSecret();
  if (!secret) return { applied: false, address: null };
  const address = url.searchParams.get("address");
  const token = url.searchParams.get("token");
  const campaignIdParam = url.searchParams.get("campaignId");
  const campaignId = campaignIdParam && /^\d+$/.test(campaignIdParam) ? BigInt(campaignIdParam) : undefined;
  const applied = !!address && !!token && verifyUnsubscribeToken(secret, address, token);
  await handleUnsubscribe(db, notificationTables, { address, token, secret, campaignId, source });
  return { applied, address: applied ? address : null };
}
