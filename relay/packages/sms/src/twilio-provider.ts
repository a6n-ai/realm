import type { ChannelProvider, OutboundMessage } from "@relay/engine";
import { countSegments } from "./segments";

export interface TwilioSmsConfig {
  accountSid: string;
  authToken: string;
  /** Sending number in E.164, or a Messaging Service SID (starts with MG). */
  from: string;
  statusCallbackUrl?: string;
  /** Refuse to send a message longer than this many segments. */
  maxSegments?: number;
}

/**
 * Twilio SMS. A thin fetch rather than the SDK: the SDK pulls a large
 * dependency tree for one POST, and the request shape is stable.
 */
export class TwilioSmsProvider implements ChannelProvider {
  constructor(private readonly config: TwilioSmsConfig) {}

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const to = message.to.phone;
    if (!to) throw new Error("SMS requires a phone number");
    const body = message.text ?? "";
    if (!body) throw new Error("SMS requires a text body");

    // Guard rail, not an optimization: a template bug that interpolates a large
    // blob would otherwise be billed per segment, silently, at campaign scale.
    const max = this.config.maxSegments ?? 4;
    const { segments } = countSegments(body);
    if (segments > max) {
      throw new Error(`SMS is ${segments} segments, over the ${max}-segment limit`);
    }

    const params = new URLSearchParams({ To: to, Body: body });
    if (this.config.from.startsWith("MG")) params.set("MessagingServiceSid", this.config.from);
    else params.set("From", this.config.from);
    if (this.config.statusCallbackUrl) params.set("StatusCallback", this.config.statusCallbackUrl);

    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${auth}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: params,
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Twilio send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { sid: string };
    return { providerMessageId: json.sid };
  }
}
