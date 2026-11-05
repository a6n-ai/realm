import { recordCampaignEvent } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";
import { suppressEmailRecipient } from "@/lib/notifications/suppression";

/**
 * Apply one SES feedback event: permanent bounce or complaint suppresses the
 * email channel for each affected recipient. Transient bounces and everything
 * else are ignored. Exported for tests (bypasses SNS signature verification).
 *
 * Lives outside the route module: Next's webpack build rejects extra exports
 * from `route.ts`.
 */
export async function processSesEvent(messageJson: string): Promise<void> {
  const event = JSON.parse(messageJson) as {
    eventType?: string;
    notificationType?: string;
    mail?: { messageId?: string };
    bounce?: { bounceType?: string; bouncedRecipients?: { emailAddress: string }[] };
    complaint?: { complainedRecipients?: { emailAddress: string }[] };
  };
  const type = event.eventType ?? event.notificationType;

  if (type === "Bounce" && event.bounce?.bounceType === "Permanent") {
    for (const r of event.bounce.bouncedRecipients ?? []) {
      await suppressEmailRecipient(r.emailAddress, "SES hard bounce");
    }
  } else if (type === "Complaint") {
    for (const r of event.complaint?.complainedRecipients ?? []) {
      await suppressEmailRecipient(r.emailAddress, "SES complaint");
    }
  }

  // Campaign stats. Attribution rides the provider message id already stamped
  // on the outbox row, so no tracking pixel of our own is needed. A
  // transactional send has no campaign and falls through as a no-op.
  const messageId = event.mail?.messageId;
  const counted: Record<string, string> = {
    Delivery: "delivered",
    Open: "opened",
    Click: "clicked",
    Bounce: "bounced",
    Complaint: "complained",
  };
  const counter = type ? counted[type] : undefined;
  if (messageId && counter) await recordCampaignEvent({ db, tables: notificationTables }, messageId, counter);
}
