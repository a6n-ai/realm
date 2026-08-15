import { isStartKeyword, isStopKeyword } from "@realm/sms";
import { toE164 } from "@realm/notifications";
import { createLogger } from "@realm/commons/logger";
import { handler, problem } from "@realm/routes";
import { suppressPhone, unsuppressPhone } from "@/lib/notifications/suppression";
import { verifyTwilioSignature } from "@/lib/notifications/twilio-signature";

export const runtime = "nodejs";
const log = createLogger("twilio-inbound");

/** Apply one inbound message. Exported for tests (bypasses signature checks). */
export async function processInbound(params: { From?: string; Body?: string }): Promise<void> {
  const phone = toE164(params.From ?? "");
  const body = params.Body ?? "";
  if (!phone) return;

  if (isStopKeyword(body)) {
    await suppressPhone(phone, "sms STOP keyword");
    log.info("sms opt-out recorded");
    return;
  }
  if (isStartKeyword(body)) {
    await unsuppressPhone(phone);
    log.info("sms opt-in restored");
  }
}

/**
 * Carrier-mandated opt-out handling. STOP, ARRÊT, UNSUBSCRIBE, CANCEL, END and
 * QUIT must immediately halt messages to that number — this is not optional and
 * must be automatic, never a manual process.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return problem(503, "SMS not configured");

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  // The public URL Twilio signed, which may differ from req.url behind the proxy.
  const url = process.env.TWILIO_INBOUND_URL ?? req.url;
  if (!verifyTwilioSignature(url, params, token, req.headers.get("x-twilio-signature"))) {
    log.error("twilio signature verification failed");
    return problem(403, "Invalid signature");
  }

  await processInbound(params);
  // Twilio expects TwiML; an empty Response element means "no auto-reply".
  return new Response("<Response/>", { headers: { "content-type": "text/xml" } });
});
