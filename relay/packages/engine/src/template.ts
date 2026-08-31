import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { interpolate } from "./interpolate";
import type { CampaignTables } from "./campaign-schema";
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

const FOOTER_MARKER = "data-realm-unsub";

export interface FooterInfo {
  url: string;
  /** Sender identification — required on every commercial message. */
  sender: string;
  /** Physical mailing address — also required. */
  address: string;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * CASL requires sender identification, a physical mailing address and a working
 * unsubscribe on every commercial message. Appending it here rather than
 * leaving it to whoever writes the copy means it cannot be forgotten — and the
 * marker makes a second pass idempotent.
 */
export function appendUnsubscribeFooter(
  parts: { html: string; text: string },
  footer: FooterInfo,
): { html: string; text: string } {
  if (parts.html.includes(FOOTER_MARKER)) return parts;
  const sender = escapeHtml(footer.sender);
  const address = escapeHtml(footer.address);
  const url = escapeHtml(footer.url);
  const html =
    `${parts.html}\n<div ${FOOTER_MARKER} style="margin-top:24px;font-size:12px;color:#666">` +
    `<p>${sender} — ${address}</p>` +
    `<p><a href="${url}">Unsubscribe</a></p></div>`;
  const text = `${parts.text}\n\n--\n${footer.sender}\n${footer.address}\nUnsubscribe: ${footer.url}\n`;
  return { html, text };
}

async function loadCampaignContent(db: Db, tables: CampaignTables, campaignId: bigint) {
  const c = tables.campaignContent;
  return db
    .select({
      channel: c.channel,
      locale: c.locale,
      subject: c.subject,
      body: c.body,
      html: c.html,
      text: c.text,
      providerTemplateId: c.providerTemplateId,
    })
    .from(c)
    .where(eq(c.campaignId, campaignId)) as unknown as Promise<Omit<TemplateRow, "enabled">[]>;
}

/** Campaign email content for a locale, or null when the channel has none. */
export async function renderCampaignEmail(
  db: Db,
  tables: CampaignTables,
  campaignId: bigint,
  locale: string,
  vars: Record<string, unknown>,
): Promise<{ subject: string; html: string; text: string } | null> {
  const rows = (await loadCampaignContent(db, tables, campaignId)).map((r) => ({ ...r, enabled: true }));
  const t = pickTemplate(rows, "email", locale);
  if (!t || !t.html || !t.text) return null;
  return {
    subject: interpolate(t.subject, vars),
    html: interpolate(t.html, vars),
    text: interpolate(t.text, vars),
  };
}

/** Campaign text content (sms/whatsapp/in_app) for a locale, or null. */
export async function renderCampaignText(
  db: Db,
  tables: CampaignTables,
  campaignId: bigint,
  channel: string,
  locale: string,
  vars: Record<string, unknown>,
): Promise<{ title: string; body: string; providerTemplateId: string | null } | null> {
  const rows = (await loadCampaignContent(db, tables, campaignId)).map((r) => ({ ...r, enabled: true }));
  const t = pickTemplate(rows, channel, locale);
  if (!t || !t.body) return null;
  return {
    title: interpolate(t.subject, vars),
    body: interpolate(t.body, vars),
    providerTemplateId: t.providerTemplateId,
  };
}
