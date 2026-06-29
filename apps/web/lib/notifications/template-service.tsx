import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { renderEmailTemplate, renderInApp } from "./render-email";

type Locale = "en" | "fr";
interface TemplateRow {
  channel: string;
  locale: string;
  subject: string;
  body: string;
  enabled: boolean;
}

/** Pure: pick the enabled row for `channel`, preferring `locale`, else `en`. */
export function pickTemplate(
  rows: TemplateRow[],
  channel: string,
  locale: string,
): { subject: string; body: string } | null {
  const enabled = rows.filter((r) => r.channel === channel && r.enabled);
  const row = enabled.find((r) => r.locale === locale) ?? enabled.find((r) => r.locale === "en");
  return row ? { subject: row.subject, body: row.body } : null;
}

async function loadRows(event: string): Promise<TemplateRow[]> {
  return db
    .select({
      channel: notificationTemplate.channel,
      locale: notificationTemplate.locale,
      subject: notificationTemplate.subject,
      body: notificationTemplate.body,
      enabled: notificationTemplate.enabled,
    })
    .from(notificationTemplate)
    .where(eq(notificationTemplate.event, event as never));
}

/** Resolve + render the email body for an event/locale, or null if no template. */
export async function renderEmailForEvent(
  event: string,
  locale: Locale,
  vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const tpl = pickTemplate(await loadRows(event), "email", locale);
  return tpl ? renderEmailTemplate({ ...tpl, vars }) : null;
}

/** Resolve + render the in-app title/body for an event/locale, or null. */
export async function renderInAppForEvent(
  event: string,
  locale: Locale,
  vars: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> {
  const tpl = pickTemplate(await loadRows(event), "in_app", locale);
  return tpl ? renderInApp({ ...tpl, vars }) : null;
}
