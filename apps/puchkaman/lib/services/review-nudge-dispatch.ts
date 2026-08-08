import { dispatchReviewNudge as dispatch } from "@realm/google-reviews";
import { createLogger } from "@realm/commons/logger";
import { getEmailProvider } from "@/lib/email/provider";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";

const log = createLogger("review-nudge-dispatch");

/**
 * Thin app-local binding: wires the shared claim-then-send sequence to
 * puchkaman's stores. Reuses BETTER_AUTH_SECRET to sign the unsubscribe
 * link — it's already the app's one server signing secret (better-auth
 * already trusts it for session/token signing); no need for a second one
 * just for this.
 */
export function dispatchReviewNudge(input: { email: string; name?: string }): Promise<void> {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseUrl = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL;
  if (!secret || !baseUrl) {
    // Matches dispatchReviewNudge's own never-throws contract — a config gap
    // here must not crash the cron loop for every other candidate in the batch.
    log.error("BETTER_AUTH_SECRET/BETTER_AUTH_URL are required to send a review nudge");
    return Promise.resolve();
  }
  return dispatch({
    ...input,
    businessName: "Puchkaman",
    configStore: integrationsConfigStore,
    nudgeStore: reviewNudgeStore,
    emailProvider: getEmailProvider(),
    unsubscribeSecret: secret,
    baseUrl,
  });
}
