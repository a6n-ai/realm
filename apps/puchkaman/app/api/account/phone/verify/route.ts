import { z } from "zod";
import { eq } from "drizzle-orm";
import { clientIp, isRateLimited } from "@foundry/commons";
import { toE164 } from "@relay/engine";
import { handler, json, problem } from "@foundry/routes";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { confirmVerification } from "@/lib/notifications/phone-verify";

const schema = z.object({
  phone: z.string().trim().min(1),
  code: z.string().trim().length(6),
});

const HOUR = 60 * 60_000;
const PER_IP = 20;

export const POST = handler(async (req: Request): Promise<Response> => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return problem(400, "Invalid request");

  // confirmVerification has its own per-code attempt ceiling; this stops a
  // caller cycling through numbers to find one with a pending code.
  const ip = clientIp(req) ?? "unknown";
  if (isRateLimited(ip, PER_IP, HOUR, "phone-confirm-ip")) {
    return problem(429, "Too many attempts. Try again later.");
  }

  const phone = toE164(parsed.data.phone);
  if (!phone) return problem(422, "Enter a valid phone number");

  const ok = await confirmVerification(phone, parsed.data.code);
  if (!ok) return problem(422, "That code is not valid");

  // Marks every account holding this number: a customer row is created per
  // email, so the same person ordering under two addresses has two rows.
  await db.update(users).set({ phoneVerified: true }).where(eq(users.phone, phone));

  return json({ verified: true });
});
