import { getGoogleReviewsConfig, shouldNudge, writeReviewUrl } from "@foundry/google-reviews";
import { ReviewBanner } from "@/components/customer/review-banner";
import { integrationsConfigReadStore } from "@/lib/payments/integrations-config";
import { hasHadATiffin, reviewNudgeStore } from "@/lib/notifications/review-nudge.service";
import { getSession } from "@/lib/auth/session";
import { currentUserId } from "@/lib/services/session-service";
import { markReviewNudgeDone } from "./review-nudge-actions";

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
