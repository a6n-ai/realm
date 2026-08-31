import { TwilioWhatsAppProvider } from "@relay/whatsapp";
import type { ChannelProvider } from "@relay/engine";

let cached: ChannelProvider | undefined;

/**
 * The WhatsApp provider, or undefined when it is not configured.
 *
 * Uses a SEPARATE sender from SMS: the WhatsApp number must be registered with
 * Meta through the WABA, and reusing TWILIO_FROM would send to a number that is
 * not enabled for WhatsApp.
 */
export function getWhatsAppProvider(): ChannelProvider | undefined {
  if (cached) return cached;
  const {
    TWILIO_ACCOUNT_SID: sid,
    TWILIO_AUTH_TOKEN: token,
    TWILIO_WHATSAPP_FROM: from,
  } = process.env;
  if (!sid || !token || !from) return undefined;
  cached = new TwilioWhatsAppProvider({
    accountSid: sid,
    authToken: token,
    from,
    statusCallbackUrl: process.env.TWILIO_STATUS_URL,
  });
  return cached;
}
