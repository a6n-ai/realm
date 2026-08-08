import { dispatchReviewNudge as dispatch } from "@realm/google-reviews";
import { getEmailProvider } from "@/lib/email/provider";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";

/** Thin app-local binding: wires the shared claim-then-send sequence to puchkaman's stores. */
export function dispatchReviewNudge(input: { email: string; name?: string }): Promise<void> {
  return dispatch({
    ...input,
    businessName: "Puchkaman",
    configStore: integrationsConfigStore,
    nudgeStore: reviewNudgeStore,
    emailProvider: getEmailProvider(),
  });
}
