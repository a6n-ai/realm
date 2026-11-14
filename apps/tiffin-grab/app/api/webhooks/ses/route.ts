import { handler, problem } from "@foundry/routes";
import { createLogger } from "@foundry/commons/logger";
import { verifySnsMessage, type SnsMessage } from "@/lib/notifications/sns-verify";
import { processSesEvent } from "./process-event";
import { sesFeedbackTopicArn } from "@/lib/runtime/env";

const log = createLogger("ses-webhook");

/**
 * SES bounce/complaint feedback endpoint. Subscribed to the SES configuration
 * set's SNS topic. SNS signs every request; we verify before trusting anything.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const raw = await req.text();
  let msg: SnsMessage;
  try {
    msg = JSON.parse(raw) as SnsMessage;
  } catch {
    return problem(400, "Invalid JSON");
  }

  if (!(await verifySnsMessage(msg))) {
    log.error("SNS signature verification failed");
    return problem(403, "Invalid signature");
  }

  // Defense in depth: only act on our own topic.
  const expected = sesFeedbackTopicArn();
  if (!expected) {
    log.error("SES_FEEDBACK_TOPIC_ARN is not set; refusing SNS message");
    return problem(403, "Topic not configured");
  }
  if (msg.TopicArn !== expected) {
    log.error(`unexpected TopicArn ${msg.TopicArn}`);
    return problem(403, "Unexpected topic");
  }

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
