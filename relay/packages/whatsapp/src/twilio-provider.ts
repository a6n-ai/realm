import type { ChannelProvider, OutboundMessage } from "@relay/engine";

export interface TwilioWhatsAppConfig {
  accountSid: string;
  authToken: string;
  /** Sender in E.164, sent as `whatsapp:+1...`. */
  from: string;
  statusCallbackUrl?: string;
}

/**
 * Twilio WhatsApp. When `providerTemplateId` is present it is sent as a Content
 * SID with JSON variables (the approved-template path); otherwise a plain body
 * is sent, which Meta accepts only inside the 24-hour service window.
 */
export class TwilioWhatsAppProvider implements ChannelProvider {
  constructor(private readonly config: TwilioWhatsAppConfig) {}

  async send(message: OutboundMessage): Promise<{ providerMessageId: string }> {
    const to = message.to.phone;
    if (!to) throw new Error("WhatsApp requires a phone number");

    const params = new URLSearchParams({
      To: `whatsapp:${to}`,
      From: `whatsapp:${this.config.from}`,
    });

    if (message.providerTemplateId) {
      params.set("ContentSid", message.providerTemplateId);
      // Twilio expects positional variables keyed "1", "2", … as a JSON object.
      if (message.vars) params.set("ContentVariables", JSON.stringify(message.vars));
    } else if (message.text) {
      params.set("Body", message.text);
    } else {
      throw new Error("WhatsApp requires either a template id or a text body");
    }

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
      throw new Error(`Twilio WhatsApp send failed (${res.status}): ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { sid: string };
    return { providerMessageId: json.sid };
  }
}
