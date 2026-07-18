import { type EmailAddress, type EmailMessage, type EmailProvider, SesEmailProvider } from "@realm/email";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { emailLog } from "@/db/schema";

let cached: EmailProvider | undefined;
const log = createLogger("email-provider");

function recipientsOf(to: EmailMessage["to"]): string {
  const list: EmailAddress[] = Array.isArray(to) ? to : [to];
  return list.map((a) => a.email).join(", ");
}

/** Best-effort audit row per send — never block or break the actual delivery. */
async function record(recipient: string, subject: string, status: "sent" | "failed", messageId?: string, error?: string) {
  try {
    await db.insert(emailLog).values({ recipient, subject, status, providerMessageId: messageId ?? null, error: error ?? null });
  } catch (err) {
    log.error({ err }, "email_log write failed");
  }
}

/**
 * The single SES email provider for the app — auth transactional mail and the
 * notification outbox both send through this. Wrapped so every send (whatever
 * its origin) lands one row in email_log. `SES_CONFIGURATION_SET` routes
 * bounce/complaint events to the SNS feedback topic.
 */
export function getEmailProvider(): EmailProvider {
  if (!cached) {
    const ses = new SesEmailProvider({
      region: process.env.AWS_REGION,
      configurationSetName: process.env.SES_CONFIGURATION_SET,
      defaultFrom: {
        email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@tiffingrab.ca",
        name: process.env.NOTIFY_FROM_NAME ?? "Tiffin Grab",
      },
    });
    cached = {
      name: ses.name,
      async send(message: EmailMessage) {
        const to = recipientsOf(message.to);
        try {
          const result = await ses.send(message);
          await record(to, message.subject, "sent", result.providerMessageId);
          return result;
        } catch (err) {
          await record(to, message.subject, "failed", undefined, err instanceof Error ? err.message : String(err));
          throw err;
        }
      },
    };
  }
  return cached;
}
