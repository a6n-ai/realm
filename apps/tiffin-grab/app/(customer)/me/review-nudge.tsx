import { getGoogleReviewsConfig, shouldNudge, writeReviewUrl } from "@realm/google-reviews";
import { ReviewNudgeCard } from "@realm/google-reviews/ui";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { getSession } from "@/lib/auth/session";
import { markReviewNudgeDone } from "./review-nudge-actions";

/** Server component: decides whether to render, never itself a client component. */
export async function ReviewNudge() {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return null;

  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
  if (!cfg.installed || !cfg.placeId) return null;

  if (!shouldNudge(await reviewNudgeStore.get(email))) return null;

  return (
    <ReviewNudgeCard
      businessName="Tiffin Grab"
      reviewUrl={writeReviewUrl(cfg.placeId)}
      onDismiss={markReviewNudgeDone}
    />
  );
}
