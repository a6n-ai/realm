import { TwilioSmsProvider } from "@relay/sms";
import type { ChannelProvider } from "@relay/engine";

let cached: ChannelProvider | undefined;

/**
 * The SMS provider, or undefined when Twilio is not configured.
 *
 * Absent credentials the channel simply has no provider, and buildHandlers
 * leaves it undefined — an enqueued sms row then fails with "No handler for
 * channel sms" and retries with backoff rather than being lost. That is the
 * intended state while toll-free verification is pending.
 */
export function getSmsProvider(): ChannelProvider | undefined {
  if (cached) return cached;
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = process.env;
  if (!sid || !token || !from) return undefined;
  cached = new TwilioSmsProvider({
    accountSid: sid,
    authToken: token,
    from,
    statusCallbackUrl: process.env.TWILIO_STATUS_URL,
    maxSegments: Number(process.env.SMS_MAX_SEGMENTS ?? 4),
  });
  return cached;
}
