import { recordCampaignEvent } from "@relay/engine";
import { handler, problem } from "@foundry/routes";
import { createLogger } from "@foundry/commons/logger";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";
import { suppressEmailRecipient } from "@/lib/notifications/suppression";
import { verifySnsMessage, type SnsMessage } from "@/lib/notifications/sns-verify";

const log = createLogger("ses-webhook");

type SnsEnvelope = SnsMessage;

/**
 * Apply one SES feedback event: permanent bounce or complaint suppresses the
 * email channel for each affected recipient. Transient bounces and everything
 * else are ignored. Exported for tests (bypasses SNS signature verification).
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

/**
 * SES bounce/complaint feedback endpoint. Subscribed to the SES configuration
 * set's SNS topic. SNS signs every request; we verify before trusting anything.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const raw = await req.text();
  let msg: SnsEnvelope;
  try {
    msg = JSON.parse(raw) as SnsEnvelope;
  } catch {
    return problem(400, "Invalid JSON");
  }

  if (!(await verifySnsMessage(msg))) {
    log.error("SNS signature verification failed");
    return problem(403, "Invalid signature");
  }

  // Defense in depth: only act on our own topic.
  const expected = process.env.SES_FEEDBACK_TOPIC_ARN;
  if (expected && msg.TopicArn !== expected) {
    log.error(`unexpected TopicArn ${msg.TopicArn}`);
    return problem(403, "Unexpected topic");
  }

  // Confirm the subscription on first handshake (signature already verified).
  if (msg.Type === "SubscriptionConfirmation" && msg.SubscribeURL) {
    await fetch(msg.SubscribeURL);
    log.info("SNS subscription confirmed");
    return Response.json({ ok: true });
  }

  if (msg.Type === "Notification") {
    await processSesEvent(msg.Message);
  }

  return Response.json({ ok: true });
});
