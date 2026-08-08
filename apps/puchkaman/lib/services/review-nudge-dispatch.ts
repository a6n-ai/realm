import {
  getGoogleReviewsConfig,
  renderReviewNudgeEmail,
  shouldNudge,
} from "@realm/google-reviews";
import { createLogger } from "@realm/commons/logger";
import { getEmailProvider } from "@/lib/email/provider";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";

const log = createLogger("review-nudge-dispatch");

/**
 * Send one review request, once per customer email, ever.
 * Never throws: a failed nudge must not fail the order it rides on.
 */
export async function dispatchReviewNudge(input: {
  email: string;
  name?: string;
}): Promise<void> {
  try {
    const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
    if (!cfg.installed || !cfg.placeId) return;

    if (!shouldNudge(await reviewNudgeStore.get(input.email))) return;

    const mail = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: input.name,
      placeId: cfg.placeId,
    });

    // Claim first: an upsert before send means a crash mid-send cannot produce
    // a second email later. One missed nudge beats nagging a customer twice.
    await reviewNudgeStore.markSent(input.email);
    await getEmailProvider().send({
      to: { email: input.email, name: input.name?.trim() || undefined },
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    log.error({ err }, "review nudge dispatch failed");
  }
}
