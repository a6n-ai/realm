import { type EmailProvider, SesEmailProvider } from "@relay/email";

let cached: EmailProvider | undefined;

/**
 * The single SES email provider for the app. Every real send (auth mail, the
 * notification outbox, campaigns, catering inquiries, review nudges) is
 * tracked in notification_outbox itself (status/providerMessageId/lastError)
 * — this used to also write email_log as a second audit trail, retired
 * 2026-09 once every send path went through the outbox.
 *
 * `SES_CONFIGURATION_SET` routes bounce/complaint events to the SNS feedback
 * topic.
 */
export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached = new SesEmailProvider({
      region: process.env.AWS_REGION,
      configurationSetName: process.env.SES_CONFIGURATION_SET,
      defaultFrom: {
        email: process.env.NOTIFY_FROM_EMAIL ?? "info@puchkaman.ca",
        name: process.env.NOTIFY_FROM_NAME ?? "Puchkaman",
      },
    });
  }
  return cached;
}
