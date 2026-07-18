import MessageValidator from "sns-validator";
import { handler, problem } from "@realm/routes";
import { createLogger } from "@realm/commons/logger";
import { suppressEmailRecipient } from "@/lib/notifications/suppression";

// sns-validator uses node crypto + fetches the signing cert over https.
export const runtime = "nodejs";

const log = createLogger("ses-webhook");
const validator = new MessageValidator();

interface SnsEnvelope {
  Type: string;
  TopicArn?: string;
  Message: string;
  SubscribeURL?: string;
}

/** Verify the message is genuinely from AWS SNS (cert host + signature). */
function verify(msg: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    validator.validate(msg as Record<string, unknown>, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Apply one SES feedback event: permanent bounce or complaint suppresses the
 * email channel for each affected recipient. Transient bounces and everything
 * else are ignored. Exported for tests (bypasses SNS signature verification).
 */
export async function processSesEvent(messageJson: string): Promise<void> {
  const event = JSON.parse(messageJson) as {
    eventType?: string;
    notificationType?: string;
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

  try {
    await verify(msg);
  } catch (err) {
    log.error({ err }, "SNS signature verification failed");
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
