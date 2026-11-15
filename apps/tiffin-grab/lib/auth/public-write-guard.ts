import { headers } from "next/headers";
import { ValidationError } from "@foundry/commons";
import { requestIp } from "@/lib/runtime/platform";
import { captchaPasses } from "./captcha";
import { allowHourly } from "./otp-throttle";

/**
 * Refusal message for a signed-out write, or null. Returned, not thrown: production redacts
 * a thrown server-action message, so actions that are not wrapped in runAction return it as `error`.
 */
export async function publicWriteRefusal(bucket: string, captchaToken: string | null | undefined, perHour: number): Promise<string | null> {
  const ip = requestIp(await headers());
  if (!(await allowHourly(`${bucket}|${ip ?? "?"}`, perHour))) return "Too many attempts. Try again in an hour.";
  if (!(await captchaPasses(captchaToken, ip))) return "Security check failed. Please try again.";
  return null;
}

/** Gate for a signed-out write: hourly cap per IP first (counts every try), then the Turnstile token. */
export async function guardPublicWrite(bucket: string, captchaToken: string | null | undefined, perHour: number): Promise<void> {
  const refusal = await publicWriteRefusal(bucket, captchaToken, perHour);
  if (refusal) throw new ValidationError(refusal);
}
