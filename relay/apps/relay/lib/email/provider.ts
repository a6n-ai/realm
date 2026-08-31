import { type EmailAddress, type EmailMessage, type EmailProvider, SesEmailProvider } from "@relay/email";
import { createLogger } from "@foundry/commons/logger";

let cached: EmailProvider | undefined;
const log = createLogger("relay-email");

function recipientsOf(to: EmailMessage["to"]): string {
  const arr: EmailAddress[] = Array.isArray(to) ? to : [to];
  return arr.map((a) => a.email).join(", ");
}

export function getEmailProvider(): EmailProvider {
  if (!cached) {
    const ses = new SesEmailProvider({
      region: process.env.AWS_REGION,
      configurationSetName: process.env.SES_CONFIGURATION_SET,
      defaultFrom: {
        email: process.env.NOTIFY_FROM_EMAIL ?? "noreply@localhost",
        name: process.env.NOTIFY_FROM_NAME ?? "Relay",
      },
    });
    cached = {
      name: ses.name,
      async send(message) {
        try {
          const result = await ses.send(message);
          log.debug({ to: recipientsOf(message.to), id: result.providerMessageId }, "sent");
          return result;
        } catch (err) {
          log.error({ err, to: recipientsOf(message.to) }, "send failed");
          throw err;
        }
      },
    };
  }
  return cached;
}
