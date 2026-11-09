import { EVENTS, type AppEvent, type EntityVars } from "./events";

export type { AppEvent };

/** Events that expose template variables; drives the editor's variable pills and template validation. */
export const EVENT_ENTITY: Partial<Record<AppEvent, EntityVars>> = Object.fromEntries(
  (Object.keys(EVENTS) as AppEvent[]).flatMap((e) => (EVENTS[e].vars ? [[e, EVENTS[e].vars]] : [])),
);

/** Returns the entity-prefixed variable names for an event, e.g. ["order.code"]. */
export function availableVariables(event: AppEvent): string[] {
  const e = EVENT_ENTITY[event];
  return e ? e.fields.map((f) => `${e.entity}.${f.name}`) : [];
}

// Same grammar as @relay/engine interpolate, including `{{a.b|fallback}}`.
const VAR_RE = /\{\{\s*([\w.]+)\s*(?:\|[^}]*)?\}\}/g;

/** Returns variables used in `body` that aren't valid for the event. */
export function validateTemplateVars(event: AppEvent, body: string): string[] {
  const known = new Set(availableVariables(event));
  const unknown: string[] = [];
  for (const m of body.matchAll(VAR_RE)) {
    const v = m[1];
    if (!known.has(v) && !unknown.includes(v)) unknown.push(v);
  }
  return unknown;
}
