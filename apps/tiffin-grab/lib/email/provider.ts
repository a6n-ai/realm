import { type EmailProvider, SesEmailProvider } from "@realm/email";

let cached: EmailProvider | undefined;

/**
 * The single SES email provider for the app — auth transactional mail and the
 * notification outbox both send through this. Built once from env (IAM role
 * creds on the box); `SES_CONFIGURATION_SET` is optional until Phase 2 wires
 * the SNS bounce/complaint feedback loop.
 */
export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached = new SesEmailProvider({
      region: process.env.AWS_REGION,
      configurationSetName: process.env.SES_CONFIGURATION_SET,
      defaultFrom: {
        email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
        name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab",
      },
    });
  }
  return cached;
}
