import { z } from "zod";
import { clientIp, isRateLimited } from "@foundry/commons";
import { toE164 } from "@relay/engine";
import { handler, json, problem } from "@foundry/routes";
import { getSmsProvider } from "@/lib/notifications/sms-provider";
import { startVerification } from "@/lib/notifications/phone-verify";

const schema = z.object({ phone: z.string().trim().min(1) });

const HOUR = 60 * 60_000;
const PER_NUMBER = 3;
const PER_IP = 10;

/**
 * Issue a verification code.
 *
 * Rate limited on BOTH the number and the caller's IP: an unthrottled endpoint
 * that sends an SMS per request is a cost-amplification vector aimed at our own
 * bill, and the per-number limit alone would let one caller walk a list of
 * numbers.
 */
export const POST = handler(async (req: Request): Promise<Response> => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "Invalid request");

  const phone = toE164(parsed.data.phone);
  if (!phone) return problem(422, "Enter a valid phone number");

  const ip = clientIp(req) ?? "unknown";
  if (isRateLimited(ip, PER_IP, HOUR, "phone-verify-ip")) {
    return problem(429, "Too many verification requests. Try again later.");
  }
  if (isRateLimited(phone, PER_NUMBER, HOUR, "phone-verify-number")) {
    return problem(429, "Too many codes sent to this number. Try again later.");
  }

  const provider = getSmsProvider();
  if (!provider) return problem(503, "SMS is not configured");

  // The plaintext code is deliberately dropped here — it goes out by SMS only.
  await startVerification(phone, { send: provider.send.bind(provider) });
  return json({ sent: true });
});
