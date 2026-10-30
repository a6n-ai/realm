import { and, eq, inArray, lt } from "drizzle-orm";
import { zonedDateIso } from "@foundry/commons";
import { getGoogleReviewsConfig, shouldNudge, writeReviewUrl } from "@foundry/google-reviews";
import { db } from "@/db/client";
import { deliveries, orders } from "@/db/schema";
import { ReviewBanner } from "@/components/customer/review-banner";
import { getAppSettings, integrationsConfigReadStore } from "@/lib/services/app-settings.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { getSession } from "@/lib/auth/session";
import { currentUserId } from "@/lib/services/session-service";
import { markReviewNudgeDone } from "./review-nudge-actions";

/** Only customers who have actually eaten with us get asked: one past, still-scheduled delivery. */
async function hasHadATiffin(userId: bigint): Promise<boolean> {
  const today = zonedDateIso(Date.now(), (await getAppSettings()).timezone);
  const [row] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(eq(orders.userId, userId), inArray(deliveries.status, ["scheduled"]), lt(deliveries.deliveryDate, today)))
    .limit(1);
  return Boolean(row);
}

/** Server component: decides whether to render, never itself a client component. */
export async function ReviewNudge() {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return null;

  const cfg = await getGoogleReviewsConfig(integrationsConfigReadStore);
  if (!cfg.installed || !cfg.placeId) return null;

  if (!shouldNudge(await reviewNudgeStore.get(email))) return null;
  const userId = await currentUserId();
  if (userId == null || !(await hasHadATiffin(userId))) return null;

  return <ReviewBanner reviewUrl={writeReviewUrl(cfg.placeId)} onDone={markReviewNudgeDone} />;
}
