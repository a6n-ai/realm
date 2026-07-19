import { type EmailProvider, SesEmailProvider } from "@realm/email";

let cached: EmailProvider | undefined;

/**
 * The single SES email provider for the app — auth transactional mail sends
 * through this. `SES_CONFIGURATION_SET` routes bounce/complaint events to the
 * SNS feedback topic. Puchkaman is tier-1 — no email_log table, so sends are
 * not audited here (unlike tiffin-grab's wrapped provider).
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
