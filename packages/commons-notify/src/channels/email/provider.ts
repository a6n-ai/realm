import { ValidationError } from "@realm/commons";
import {
  emailMessageSchema,
  type EmailAddress,
  type EmailMessage,
  type PreparedEmail,
  type SendResult,
} from "./types";

/** The contract every email provider (SES, SMTP, SendGrid, …) fulfills. */
export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<SendResult>;
}

export interface EmailProviderConfig {
  /** Used when a message omits `from`. */
  defaultFrom: EmailAddress;
}

/**
 * Shared provider concerns: validate + normalize the message and apply the
 * default sender, then hand a clean PreparedEmail to the concrete transport.
 * Subclasses implement only `deliver` (the actual API/SMTP call).
 */
export abstract class AbstractEmailProvider implements EmailProvider {
  abstract readonly name: string;

  protected constructor(protected readonly config: EmailProviderConfig) {}

  async send(message: EmailMessage): Promise<SendResult> {
    const parsed = emailMessageSchema.safeParse(message);
    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid email");
    }
    const prepared: PreparedEmail = {
      ...parsed.data,
      from: parsed.data.from ?? this.config.defaultFrom,
    };
    return this.deliver(prepared);
  }

  /** Concrete transport. Provider id goes in the returned SendResult. */
  protected abstract deliver(message: PreparedEmail): Promise<SendResult>;
}
