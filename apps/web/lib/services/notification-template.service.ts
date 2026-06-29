import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { notificationTemplate } from "@/db/schema";
import { EVENT_ENTITY, validateTemplateVars, type AppEvent } from "@/lib/notifications/event-entities";

type Channel = "email" | "in_app";
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

export async function upsertTemplate(input: {
  event: AppEvent;
  channel: Channel;
  locale: Locale;
  subject: string;
  body: string;
  enabled: boolean;
}): Promise<void> {
  assertValidVars(input.event, input.body);
  assertValidVars(input.event, input.subject);
  await db
    .insert(notificationTemplate)
    .values(input)
    .onConflictDoUpdate({
      target: [notificationTemplate.event, notificationTemplate.channel, notificationTemplate.locale],
      set: { subject: input.subject, body: input.body, enabled: input.enabled },
    });
}
