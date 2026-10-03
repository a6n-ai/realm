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
 * staff edits to the others. `--only menu_reminder --overwrite` re-applies the
 * designed copy to the weekly menu reminder (a system campaign, not an event).
 * Links are absolute: set EMAIL_BASE_URL for a non-prod host (default https://app.tiffingrab.ca).
 */
import { render } from "@react-email/components";
import { db } from "./client";
import { and, eq } from "drizzle-orm";
import { campaign, campaignContent, notificationTemplate } from "./schema";
import { MENU_REMINDER_KEY, renderMenuReminder } from "../lib/notifications/menu-reminder";
import { TEMPLATES } from "../emails/transactional";

const overwrite = process.argv.includes("--overwrite");
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : undefined;

async function main() {
  if (only === MENU_REMINDER_KEY) {
    if (!overwrite) throw new Error("menu_reminder is seeded on first use; pass --overwrite to re-apply the design");
    const [c] = await db.select({ id: campaign.id }).from(campaign).where(eq(campaign.systemKey, MENU_REMINDER_KEY));
    if (!c) throw new Error("Menu reminder not created yet; it is seeded when Templates is first opened");
    const content = await renderMenuReminder();
    await db
      .update(campaignContent)
      .set(content)
      .where(and(eq(campaignContent.campaignId, c.id), eq(campaignContent.channel, "email"), eq(campaignContent.locale, "en")));
    console.log("wrote: menu_reminder");
    process.exit(0);
  }
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
