import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { interpolate } from "./interpolate";
import type { NotificationTables } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface TemplateRow {
  channel: string;
  locale: string;
  subject: string;
  body: string | null;
  html: string | null;
  text: string | null;
  providerTemplateId: string | null;
  enabled: boolean;
}

/** Pure: pick the enabled row for `channel`, preferring `locale`, else `en`. */
export function pickTemplate(rows: TemplateRow[], channel: string, locale: string): TemplateRow | null {
  const enabled = rows.filter((r) => r.channel === channel && r.enabled);
  return enabled.find((r) => r.locale === locale) ?? enabled.find((r) => r.locale === "en") ?? null;
}

async function loadRows(db: Db, tables: NotificationTables, event: string): Promise<TemplateRow[]> {
  const t = tables.notificationTemplate;
  return db.select({
    channel: t.channel, locale: t.locale, subject: t.subject, body: t.body,
    html: t.html, text: t.text, providerTemplateId: t.providerTemplateId, enabled: t.enabled,
  }).from(t).where(eq(t.event, event as never)) as unknown as Promise<TemplateRow[]>;
}

/** Resolve + render the email body for an event/locale, or null if no template. */
export async function renderEmailForEvent(
  db: Db, tables: NotificationTables, event: string, locale: string, vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const t = pickTemplate(await loadRows(db, tables, event), "email", locale);
  if (!t || !t.html || !t.text) return null;
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.html, vars),
    text: interpolate(t.text, vars),
  };
}

/** Resolve + render the in-app title/body for an event/locale, or null. */
export async function renderInAppForEvent(
  db: Db, tables: NotificationTables, event: string, locale: string, vars: Record<string, unknown>,
): Promise<{ title: string; body: string } | null> {
  const t = pickTemplate(await loadRows(db, tables, event), "in_app", locale);
  if (!t || !t.body) return null;
  return { title: interpolate(t.subject, vars), body: interpolate(t.body, vars) };
}
