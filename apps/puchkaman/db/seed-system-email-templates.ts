/**
 * Idempotent seed: notification_template rows for "review_nudge" and
 * "catering_inquiry" (2026-09 migration off direct SES send).
 *
 * review_nudge is a pure passthrough — @foundry/google-reviews' nudge-email.ts
 * fully renders subject/html/text before handing it to
 * reviewNudgeEmailProvider, so the template just forwards those vars.
 *
 * catering_inquiry is a real template: {{rowsHtml}}/{{rowsText}} carry the
 * details table exactly as the old direct-send route built it, while the
 * individual fields ({{name}}, {{guests}}, ...) stay available for an admin
 * to rewrite the copy from Templates without touching code.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/puchkaman/db/seed-system-email-templates.ts
 */
import { db } from "./client";
import { notificationTemplate } from "./schema";

const ITEMS = [
  {
    event: "review_nudge",
    subject: "{{subject}}",
    html: "{{html}}",
    text: "{{text}}",
  },
  {
    event: "catering_inquiry",
    subject: "[{{region}}] Catering quote — {{name}} ({{guests}} guests, {{type}})",
    html: "<h2>New catering quote request</h2>{{rowsHtml}}",
    text: "New catering quote request\n\n{{rowsText}}",
  },
] as const;

async function main() {
  for (const item of ITEMS) {
    await db
      .insert(notificationTemplate)
      .values({
        event: item.event as never,
        channel: "email",
        locale: "en",
        subject: item.subject,
        body: item.html,
        html: item.html,
        text: item.text,
        enabled: true,
      })
      .onConflictDoNothing({
        target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
      });
    console.log(`seeded: ${item.event}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
