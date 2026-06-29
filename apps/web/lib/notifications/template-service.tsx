import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { interpolate } from "./interpolate";

type Locale = "en" | "fr";
interface TemplateRow { channel: string; locale: string; subject: string; body: string | null; html: string | null; text: string | null; enabled: boolean }

/** Pure: pick the enabled row for `channel`, preferring `locale`, else `en`. */
export function pickTemplate(rows: TemplateRow[], channel: string, locale: string): TemplateRow | null {
  const enabled = rows.filter((r) => r.channel === channel && r.enabled);
  return enabled.find((r) => r.locale === locale) ?? enabled.find((r) => r.locale === "en") ?? null;
}

async function loadRows(event: string): Promise<TemplateRow[]> {
  return db.select({
    channel: notificationTemplate.channel, locale: notificationTemplate.locale,
    subject: notificationTemplate.subject, body: notificationTemplate.body,
    html: notificationTemplate.html, text: notificationTemplate.text, enabled: notificationTemplate.enabled,
  }).from(notificationTemplate).where(eq(notificationTemplate.event, event as never));
}

/** Resolve + render the email body for an event/locale, or null if no template. */
export async function renderEmailForEvent(event: string, locale: Locale, vars: Record<string, unknown>): Promise<{ subject: string; html: string; text: string } | null> {
  const t = pickTemplate(await loadRows(event), "email", locale);
  if (!t || !t.html || !t.text) return null;
  return { subject: interpolate(t.subject, vars), html: interpolate(t.html, vars), text: interpolate(t.text, vars) };
}

/** Resolve + render the in-app title/body for an event/locale, or null. */
export async function renderInAppForEvent(event: string, locale: Locale, vars: Record<string, unknown>): Promise<{ title: string; body: string } | null> {
  const t = pickTemplate(await loadRows(event), "in_app", locale);
  if (!t || !t.body) return null;
  return { title: interpolate(t.subject, vars), body: interpolate(t.body, vars) };
}
