import { type EmailProvider, SesEmailProvider } from "@relay/email";
import { SITE_NAME } from "@/lib/brand";

let cached: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    cached = new SesEmailProvider({
      region: process.env.AWS_REGION,
      configurationSetName: process.env.SES_CONFIGURATION_SET,
      defaultFrom: {
        email: process.env.NOTIFY_FROM_EMAIL ?? "hello@xplorers.life",
        name: process.env.NOTIFY_FROM_NAME ?? SITE_NAME,
      },
    });
  }
  return cached;
}
