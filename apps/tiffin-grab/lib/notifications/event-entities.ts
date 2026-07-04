import { appEvent } from "@/db/schema";

export type AppEvent = (typeof appEvent.enumValues)[number];

interface Field {
  name: string;
  label: string;
}
interface EntityVars {
  entity: string;
  fields: Field[];
}

/**
 * Maps each event to its entity and the DB columns exposed as template
 * variables (referenced `{{entity.field}}`). Drives the editor's variable pills
 * and template validation. Direct columns only — calculated vars deferred.
 */
export const EVENT_ENTITY: Partial<Record<AppEvent, EntityVars>> = {
  order_created: {
    entity: "order",
    fields: [
      { name: "code", label: "Order code" },
      { name: "customerName", label: "Customer name" },
    ],
  },
  order_activated: {
    entity: "order",
    fields: [
      { name: "code", label: "Order code" },
      { name: "planType", label: "Plan type" },
      { name: "total", label: "Total" },
      { name: "startDate", label: "Start date" },
      { name: "customerName", label: "Customer name" },
    ],
  },
  order_cancelled: {
    entity: "order",
    fields: [
      { name: "code", label: "Order code" },
      { name: "customerName", label: "Customer name" },
    ],
  },
  payment_received: {
    entity: "payment",
    fields: [
      { name: "amount", label: "Amount" },
      { name: "orderCode", label: "Order code" },
    ],
  },
  refund_issued: {
    entity: "payment",
    fields: [
      { name: "amount", label: "Amount" },
      { name: "orderCode", label: "Order code" },
    ],
  },
  menu_released: {
    entity: "menuWeek",
    fields: [
      { name: "weekStartIso", label: "Week starting" },
      { name: "cutoffLabel", label: "Cutoff" },
    ],
  },
  wallet_credited: {
    entity: "wallet",
    fields: [
      { name: "coins", label: "Coins" },
      { name: "reason", label: "Reason" },
    ],
  },
  ticket_reply: {
    entity: "ticket",
    fields: [
      { name: "subject", label: "Subject" },
      { name: "code", label: "Ticket code" },
    ],
  },
  inquiry_follow_up: {
    entity: "inquiry",
    fields: [{ name: "customerName", label: "Customer name" }],
  },
};

/** Returns the entity-prefixed variable names for an event, e.g. ["order.code"]. */
export function availableVariables(event: AppEvent): string[] {
  const e = EVENT_ENTITY[event];
  return e ? e.fields.map((f) => `${e.entity}.${f.name}`) : [];
}

const VAR_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

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
