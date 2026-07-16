import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandOutput,
} from "@aws-sdk/client-sesv2";
import { AppError } from "@realm/commons";
import {
  AbstractEmailProvider,
  type EmailProviderConfig,
} from "./provider";
import type { EmailAddress, PreparedEmail, SendResult } from "./types";

/** Minimal slice of SESv2Client we use — lets tests inject a fake. */
export interface SesSendClient {
  send(command: SendEmailCommand): Promise<SendEmailCommandOutput>;
}

export interface SesProviderConfig extends EmailProviderConfig {
  /** AWS region, e.g. "us-east-1". Ignored when a client is injected. */
  region?: string;
  /**
   * SES configuration set — routes bounce/complaint/delivery events to the
   * SNS feedback topic. Required for the suppression webhook to work.
   */
  configurationSetName?: string;
  /** Inject for tests; otherwise a real SESv2Client is built (IAM role creds). */
  client?: SesSendClient;
}

function formatAddress({ email, name }: EmailAddress): string {
  // ponytail: RFC2047 encoding skipped — add when a sender name needs non-ASCII.
  return name ? `${name} <${email}>` : email;
}

export class SesEmailProvider extends AbstractEmailProvider {
  readonly name = "ses";
  private readonly client: SesSendClient;
  private readonly configurationSetName?: string;

  constructor(config: SesProviderConfig) {
    super(config);
    this.client = config.client ?? new SESv2Client({ region: config.region });
    this.configurationSetName = config.configurationSetName;
  }

  protected async deliver(message: PreparedEmail): Promise<SendResult> {
    const to = Array.isArray(message.to) ? message.to : [message.to];
    const command = new SendEmailCommand({
      FromEmailAddress: formatAddress(message.from),
      Destination: {
        ToAddresses: to.map(formatAddress),
        CcAddresses: message.cc?.map(formatAddress),
        BccAddresses: message.bcc?.map(formatAddress),
      },
      ReplyToAddresses: message.replyTo ? [formatAddress(message.replyTo)] : undefined,
      ConfigurationSetName: this.configurationSetName,
      Content: {
        Simple: {
          Subject: { Data: message.subject, Charset: "UTF-8" },
          Body: {
            Html: message.html ? { Data: message.html, Charset: "UTF-8" } : undefined,
            Text: message.text ? { Data: message.text, Charset: "UTF-8" } : undefined,
          },
        },
      },
    });

    const out = await this.client.send(command);
    if (!out.MessageId) {
      throw new AppError("SES returned no MessageId", 502);
    }
    return { providerMessageId: out.MessageId, provider: this.name };
  }
}
