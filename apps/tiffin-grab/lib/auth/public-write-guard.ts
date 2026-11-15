import { headers } from "next/headers";
import { ValidationError } from "@foundry/commons";
import { requestIp } from "@/lib/runtime/platform";
import { captchaPasses } from "./captcha";
import { allowHourly } from "./otp-throttle";

/** Gate for a signed-out write: hourly cap per IP first (counts every try), then the Turnstile token. */
export async function guardPublicWrite(bucket: string, captchaToken: string | null | undefined, perHour: number): Promise<void> {
  const ip = requestIp(await headers());
  if (!(await allowHourly(`${bucket}|${ip ?? "?"}`, perHour))) {
    throw new ValidationError("Too many attempts. Try again in an hour.");
  }
  if (!(await captchaPasses(captchaToken, ip))) throw new ValidationError("Security check failed. Please try again.");
}
