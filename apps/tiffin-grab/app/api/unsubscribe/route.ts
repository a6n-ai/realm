import { and, eq } from "drizzle-orm";
import { handleUnsubscribe, normalizeAddress, verifyUnsubscribeToken } from "@relay/engine";
import { handler, json } from "@foundry/routes";
import { db } from "@/db/client";
import { messageSuppression } from "@/db/schema";
import { notificationTables } from "@/lib/notifications/tables";

/**
 * One-click unsubscribe. The token IS the auth, so no session is needed — a
 * recipient who never had an account must be able to opt out.
 *
 * The HTTP response is identical whether or not the token verified and whether
 * or not the address exists, so the endpoint cannot be used to test membership.
 * `applied` is for the page only: it is true just when the caller presented a
 * valid signed link for that address, which says nothing about any list.
 * `fresh` is true only when this request is what unsubscribed them — the page
 * offers "subscribe again" just then, so an old or forwarded unsubscribe link
 * can never be turned into a way to re-subscribe someone who already opted out.
 */
export async function applyUnsubscribe(
  url: URL,
  source: "link" | "one-click",
): Promise<{ applied: boolean; address: string | null; fresh: boolean }> {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) return { applied: false, address: null, fresh: false };
  const address = url.searchParams.get("address");
  const token = url.searchParams.get("token");
  const campaignIdParam = url.searchParams.get("campaignId");
  const campaignId = campaignIdParam && /^\d+$/.test(campaignIdParam) ? BigInt(campaignIdParam) : undefined;
  const applied = !!address && !!token && verifyUnsubscribeToken(secret, address, token);
  const already = applied
    ? await db
        .select({ id: messageSuppression.id })
        .from(messageSuppression)
        .where(and(eq(messageSuppression.address, normalizeAddress(address)), eq(messageSuppression.scope, "marketing")))
        .limit(1)
    : [];
  await handleUnsubscribe(db, notificationTables, { address, token, secret, campaignId, source });
  return { applied, address: applied ? address : null, fresh: applied && already.length === 0 };
}

export const GET = handler(async (req: Request): Promise<Response> => {
  await applyUnsubscribe(new URL(req.url), "link");
  return json({ ok: true });
});

// RFC 8058 one-click: mail clients POST the List-Unsubscribe-Post target.
export const POST = handler(async (req: Request): Promise<Response> => {
  await applyUnsubscribe(new URL(req.url), "one-click");
  return json({ ok: true });
});
