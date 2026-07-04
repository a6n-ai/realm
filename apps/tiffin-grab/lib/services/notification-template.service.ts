import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { EVENT_ENTITY, validateTemplateVars, type AppEvent } from "@/lib/notifications/event-entities";

type Locale = "en" | "fr";

/** Throw if `body` uses variables not valid for the event. */
export function assertValidVars(event: AppEvent, body: string): void {
  const unknown = validateTemplateVars(event, body);
  if (unknown.length) throw new ValidationError(`Unknown variables: ${unknown.join(", ")}`);
}

/** Registry-driven placeholder data for previews / test sends, e.g.
 *  { order: { code: "<Order code>", … } }. */
export function sampleVars(event: AppEvent): Record<string, unknown> {
  const e = EVENT_ENTITY[event];
  if (!e) return {};
  const obj: Record<string, string> = {};
  for (const f of e.fields) obj[f.name] = `<${f.label}>`;
  return { [e.entity]: obj };
}

export async function listTemplates() {
  return db.select().from(notificationTemplate);
}

type EmailInput = { event: AppEvent; channel: "email"; locale: Locale; subject: string; body: string; html: string; text: string; enabled: boolean };
type InAppInput = { event: AppEvent; channel: "in_app"; locale: Locale; subject: string; body: string; enabled: boolean };
export type UpsertInput = EmailInput | InAppInput;

export async function upsertTemplate(input: UpsertInput): Promise<void> {
  assertValidVars(input.event, input.subject);
  if (input.channel === "email") {
    if (!input.html || !input.text || !input.body) throw new ValidationError("Email template needs body, html and text");
  } else {
    if (!input.body) throw new ValidationError("In-app template needs a body");
    assertValidVars(input.event, input.body);
  }
  const values =
    input.channel === "email"
      ? { event: input.event, channel: input.channel, locale: input.locale, subject: input.subject, body: input.body, html: input.html, text: input.text, enabled: input.enabled }
      : { event: input.event, channel: input.channel, locale: input.locale, subject: input.subject, body: input.body, html: null, text: null, enabled: input.enabled };
  await db
    .insert(notificationTemplate)
    .values(values)
    .onConflictDoUpdate({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
      set: { subject: values.subject, body: values.body, html: values.html, text: values.text, enabled: values.enabled },
    });
}
