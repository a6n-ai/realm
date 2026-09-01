import MessageValidator from "sns-validator";
import { createLogger } from "@foundry/commons/logger";
import { suppressEmailRecipient } from "@/lib/notifications/suppression";

export const runtime = "nodejs";

const log = createLogger("ses-webhook");
const validator = new MessageValidator();

interface SnsEnvelope {
  Type: string;
  TopicArn?: string;
  Message: string;
}

function verify(msg: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    validator.validate(msg as Record<string, unknown>, (err) => (err ? reject(err) : resolve()));
  });
}

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

export async function POST(req: Request): Promise<Response> {
  const raw = await req.text();
  let msg: SnsEnvelope;
  try {
    msg = JSON.parse(raw) as SnsEnvelope;
  } catch {
    return Response.json({ title: "Invalid JSON", status: 400 }, { status: 400 });
  }
  try {
    await verify(msg);
  } catch (err) {
    log.error({ err }, "SNS signature verification failed");
    return Response.json({ title: "Invalid signature", status: 403 }, { status: 403 });
  }
  const expected = process.env.SES_FEEDBACK_TOPIC_ARN;
  if (expected && msg.TopicArn !== expected) {
    return Response.json({ title: "Unexpected topic", status: 403 }, { status: 403 });
  }
  if (msg.Type === "SubscriptionConfirmation") {
    log.info({ topic: msg.TopicArn }, "SNS subscription confirmation; confirm the subscription in AWS");
    return new Response(null, { status: 200 });
  }
  if (msg.Type === "Notification") {
    await processSesEvent(msg.Message);
  }
  return new Response(null, { status: 200 });
}
