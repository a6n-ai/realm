import type { IntegrationsConfigStore } from "@foundry/commons/plugin";
import type { EmailProvider } from "@foundry/email";
import { createLogger } from "@foundry/commons/logger";
import { getGoogleReviewsConfig } from "./store";
import { renderReviewNudgeEmail } from "./nudge-email";
import { shouldNudge, type ReviewNudgeStore } from "./nudge";
import { buildUnsubscribeUrl } from "./unsubscribe";

const log = createLogger("review-nudge-dispatch");

/**
 * Send one review request, once per customer email, ever. Never throws — a failed
 * nudge must not fail whatever it rides on (an order fulfilling, a cron loop
 * continuing). The claim-then-send ordering is the one invariant this whole
 * feature rests on: `markSent` commits before the email goes out, so a crash
 * mid-send cannot produce a second email later.
 *
 * Parameterised by the pieces that differ per app (email transport, business
 * name, config/nudge stores) rather than per app reimplementing this sequence —
 * both callers must stay claim-before-send in lockstep, and a package doing the
 * sequencing is the one place that can guarantee it.
 */
export async function dispatchReviewNudge(input: {
  email: string;
  name?: string;
  businessName: string;
  configStore: IntegrationsConfigStore;
  nudgeStore: ReviewNudgeStore;
  emailProvider: EmailProvider;
  /** App origin + signing secret for the CASL-required unsubscribe link. */
  unsubscribeSecret: string;
  baseUrl: string;
}): Promise<void> {
  try {
    const cfg = await getGoogleReviewsConfig(input.configStore);
    if (!cfg.installed || !cfg.placeId) return;

    if (!shouldNudge(await input.nudgeStore.get(input.email))) return;

    const mail = await renderReviewNudgeEmail({
      businessName: input.businessName,
      customerName: input.name,
      placeId: cfg.placeId,
      unsubscribeUrl: buildUnsubscribeUrl(input.baseUrl, input.unsubscribeSecret, input.email),
    });

    await input.nudgeStore.markSent(input.email);
    await input.emailProvider.send({
      to: { email: input.email, name: input.name?.trim() || undefined },
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    log.error({ err }, "review nudge dispatch failed");
  }
}
