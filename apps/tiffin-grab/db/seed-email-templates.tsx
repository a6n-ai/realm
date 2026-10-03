/**
 * Seeds notification_template rows for every transactional email, rendered from
 * emails/transactional.tsx (the customer design system). `{{var}}` placeholders
 * pass through for @relay/engine to fill at send time.
 *
 * Default: insert missing rows only, so staff edits in Notifications → Templates
 * survive. `--overwrite` replaces existing rows with the designed version.
 *
 * Run:
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/tiffin-grab/db/seed-email-templates.tsx [--overwrite] [--only <event>]
 * `--only` limits the run to one event, so redesigning one email cannot clobber
 * staff edits to the others.
 * Links are absolute: set EMAIL_BASE_URL for a non-prod host (default https://app.tiffingrab.ca).
 */
import { render } from "@react-email/components";
import { db } from "./client";
import { notificationTemplate } from "./schema";
import { TEMPLATES } from "../emails/transactional";

const overwrite = process.argv.includes("--overwrite");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : undefined;

async function main() {
  if (only && !TEMPLATES.some((t) => t.event === only)) throw new Error(`No template for event "${only}"`);
  for (const t of TEMPLATES) {
    if (only && t.event !== only) continue;
    const html = await render(t.element);
    const text = await render(t.element, { plainText: true });
    const values = {
      event: t.event as never,
      channel: "email" as const,
      locale: "en" as const,
      subject: t.subject,
      body: html,
      html,
      text,
      enabled: true,
    };
    const target = [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale];
    const insert = db.insert(notificationTemplate).values(values);
    await (overwrite
      ? insert.onConflictDoUpdate({ target, set: { subject: t.subject, body: html, html, text } })
      : insert.onConflictDoNothing({ target }));
    console.log(`${overwrite ? "wrote" : "ensured"}: ${t.event}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
