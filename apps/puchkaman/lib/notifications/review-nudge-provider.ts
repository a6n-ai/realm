import type { EmailProvider, EmailMessage } from "@relay/email";
import { db } from "@/db/client";
import { enqueueNotification } from "@/lib/notifications/enqueue";

/**
 * @foundry/google-reviews' dispatchReviewNudge renders the email itself and
 * calls `emailProvider.send()`. This adapter enqueues that already-rendered
 * message instead of sending it directly, so review nudges land in the outbox
 * (Logs, fast drainer, suppression) like every other email. The stored
 * template for "review_nudge" is a passthrough ("{{subject}}"/"{{html}}"/
 * "{{text}}") — the copy still lives in nudge-email.ts, not duplicated in the
 * DB.
 */
export function reviewNudgeEmailProvider(): EmailProvider {
  return {
    name: "review-nudge-outbox",
    async send(message: EmailMessage) {
      const to = Array.isArray(message.to) ? message.to[0] : message.to;
      await db.transaction((tx) =>
        enqueueNotification(tx, {
          event: "review_nudge",
          recipientEmail: to.email,
          title: message.subject,
          body: "",
          channels: ["email"],
          kind: "transactional",
          data: { subject: message.subject, html: message.html ?? "", text: message.text ?? "" },
        }),
      );
      return { providerMessageId: "queued", provider: "review-nudge-outbox" };
    },
  };
}
