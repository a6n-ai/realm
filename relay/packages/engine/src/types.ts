/** Delivery channels. email + in_app ship now; sms/whatsapp are handler-only additions. */
export type Channel = "email" | "in_app" | "sms" | "whatsapp";

/**
 * Consent regime. `transactional` is a receipt the recipient cannot opt out of;
 * `marketing` is a commercial message that requires consent and an unsubscribe.
 * They share a delivery path but never share an opt-out.
 */
export type Kind = "transactional" | "marketing";

/** An already-rendered message. Rendering happens upstream; a provider only transports. */
export interface OutboundMessage {
  to: { email?: string; phone?: string; name?: string };
  /** email only */
  subject?: string;
  html?: string;
  text?: string;
  /** whatsapp / templated sms: the provider-side approved template id */
  providerTemplateId?: string;
  /** merge values for a provider-side template */
  vars?: Record<string, unknown>;
}

export interface ChannelProvider {
  send(msg: OutboundMessage): Promise<{ providerMessageId: string }>;
}
