/**
 * Idempotent seed: notification_template row for "review_nudge" (2026-09
 * migration off direct SES send). The copy still lives in
 * @foundry/google-reviews' nudge-email.ts, which fully renders subject/html/
 * text before handing it to reviewNudgeEmailProvider — so this template is a
 * pure passthrough, not a duplicate of that copy.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/tiffin-grab/db/seed-system-email-templates.ts
 */
import { db } from "./client";
import { notificationTemplate } from "./schema";

async function main() {
  await db
    .insert(notificationTemplate)
    .values({
      event: "review_nudge" as never,
      channel: "email",
      locale: "en",
      subject: "{{subject}}",
      body: "{{html}}",
      html: "{{html}}",
      text: "{{text}}",
      enabled: true,
    })
    .onConflictDoNothing({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
    });
  console.log("seeded: review_nudge");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
