import { handleUnsubscribe, verifyUnsubscribeToken } from "@relay/engine";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { campaign } from "@/db/schema";
import { queueBlock } from "@/lib/relay/blocks";
import { unsubscribeSecret } from "@/lib/runtime/env";
import { signalOutbox } from "@/lib/notifications/outbox-signal";
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
  const campaignId = campaignIdParam && /^\d{1,18}$/.test(campaignIdParam) ? BigInt(campaignIdParam) : undefined;
  if (!address || !token || !verifyUnsubscribeToken(secret, address, token)) return { applied: false, address: null };
  // The local row and the event bound for Relay commit together, so neither can exist without the other.
  await db.transaction(async (tx) => {
    await handleUnsubscribe(tx as unknown as typeof db, notificationTables, { address, token, secret, campaignId, source });
    if (!address.includes("@")) return;
    const [from] = campaignId
      ? await tx.select({ publicId: campaign.publicId, name: campaign.name }).from(campaign).where(eq(campaign.id, campaignId))
      : [];
    await queueBlock(tx, {
      email: address,
      reason: "unsubscribe",
      stream: "marketing",
      source,
      campaignRef: from?.publicId ?? null,
      campaignName: from?.name ?? null,
      createdAt: Date.now(),
    });
  });
  await signalOutbox();
  return { applied: true, address };
}
