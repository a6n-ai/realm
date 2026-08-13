import { toE164 } from "@realm/notifications";
import { createLogger } from "@realm/commons/logger";
import { handler, problem } from "@realm/routes";
import { recordCampaignEvent } from "@/lib/notifications/campaign-stats";
import { suppressPhone } from "@/lib/notifications/suppression";
import { verifyTwilioSignature } from "@/lib/notifications/twilio-signature";

export const runtime = "nodejs";
const log = createLogger("twilio-status");

/**
 * PERMANENT carrier failures only. A transient error that permanently blocked a
 * number would silently lose a customer, so queueing, rate limits and temporary
 * carrier errors are deliberately absent from this set.
 *
 * 30003 unreachable handset · 30005 unknown destination ·
 * 30006 landline or unreachable carrier · 21610 opted out at Twilio's level
 */
const PERMANENT = new Set(["30003", "30005", "30006", "21610"]);

/** Terminal statuses worth counting. Intermediate ones (queued, sent) are noise. */
const COUNTED: Record<string, string> = {
  delivered: "delivered",
  failed: "failed",
  undelivered: "failed",
  read: "read",
};

/** Apply one status callback. Exported for tests (bypasses signature checks). */
export async function processStatus(p: Record<string, string | undefined>): Promise<void> {
  const sid = p.MessageSid;
  const status = p.MessageStatus ?? "";
  if (!sid || !COUNTED[status]) return;

  await recordCampaignEvent(sid, COUNTED[status]);

  if (p.ErrorCode && PERMANENT.has(p.ErrorCode)) {
    // Twilio prefixes WhatsApp destinations; the suppression key is the bare number.
    const phone = toE164((p.To ?? "").replace(/^whatsapp:/, ""));
    if (phone) await suppressPhone(phone, `carrier undeliverable ${p.ErrorCode}`);
  }
}

export const POST = handler(async (req: Request): Promise<Response> => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return problem(503, "SMS not configured");

  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    params[k] = String(v);
  });

  const url = process.env.TWILIO_STATUS_URL ?? req.url;
  if (!verifyTwilioSignature(url, params, token, req.headers.get("x-twilio-signature"))) {
    log.error("twilio signature verification failed");
    return problem(403, "Invalid signature");
  }

  await processStatus(params);
  return new Response("<Response/>", { headers: { "content-type": "text/xml" } });
});
