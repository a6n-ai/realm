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
 * Maps each event to its entity and the fields exposed as template variables
 * (referenced `{{entity.field}}`). Drives the editor's variable pills and
 * template validation.
 *
 * The field names must match what the emitters actually put in `data` — see
 * enqueueNotification calls in orders.service.ts. A name here that the emitter
 * never sends renders as an empty string, which is worse than a visible error.
 */
export const EVENT_ENTITY: Partial<Record<AppEvent, EntityVars>> = {
  order_placed: {
    entity: "order",
    fields: [
      { name: "publicId", label: "Order code" },
      { name: "total", label: "Total" },
      { name: "name", label: "Customer name" },
    ],
  },
  order_paid: {
    entity: "order",
    fields: [
      { name: "publicId", label: "Order code" },
      { name: "total", label: "Total" },
    ],
  },
  order_fulfilled: {
    entity: "order",
    fields: [{ name: "publicId", label: "Order code" }],
  },
  order_cancelled: {
    entity: "order",
    fields: [{ name: "publicId", label: "Order code" }],
  },
  refund_issued: {
    entity: "order",
    fields: [
      { name: "publicId", label: "Order code" },
      { name: "total", label: "Amount" },
    ],
  },
  payment_failed: {
    entity: "order",
    fields: [{ name: "publicId", label: "Order code" }],
  },
  catering_inquiry: {
    entity: "inquiry",
    fields: [
      { name: "name", label: "Customer name" },
      { name: "guests", label: "Guests" },
      { name: "date", label: "Event date" },
    ],
  },
  contact_message: {
    entity: "message",
    fields: [{ name: "name", label: "Sender name" }],
  },
  cart_abandoned: {
    entity: "cart",
    fields: [
      { name: "itemCount", label: "Item count" },
      { name: "firstItem", label: "First item name" },
      { name: "cartUrl", label: "Cart link" },
    ],
  },
  checkout_abandoned: {
    entity: "order",
    fields: [
      { name: "publicId", label: "Order code" },
      { name: "total", label: "Total" },
      { name: "resumeUrl", label: "Resume payment link" },
    ],
  },
  clover_customer_invite: {
    entity: "customer",
    fields: [{ name: "name", label: "Customer name" }],
  },
};

/** Returns the entity-prefixed variable names for an event, e.g. ["order.publicId"]. */
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
