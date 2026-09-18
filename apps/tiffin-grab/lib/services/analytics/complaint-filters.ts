import { and, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { deliveryZones, orders, plans, tickets, users } from "@/db/schema";
import { isTicketCategory, TICKET_CATEGORIES, type TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

/**
 * Complaint analytics and the ticket queue read the SAME query parameters, so
 * every chart and metric on the dashboard can link straight to the tickets
 * behind it. Change a name here and both ends move together.
 */
export const COMPLAINT_PARAMS = [
  "from", "to", "category", "subcategory", "status", "priority", "plan", "zone",
] as const;

export type ComplaintSearchParams = Partial<Record<(typeof COMPLAINT_PARAMS)[number], string>>;

export type ComplaintFilters = {
  from?: number;
  to?: number;
  categories: string[];
  subcategories: string[];
  statuses: string[];
  priorities: string[];
  plans: string[];
  zones: string[];
};

/**
 * Feedback & Suggestions is a real ticket category but not a complaint — a
 * compliment or a menu idea should not inflate the complaint count or the rate
 * per 100 tiffins. It still appears in the category breakdown; it is only
 * excluded from the complaint headline metrics.
 */
export const NON_COMPLAINT_CATEGORIES = ["feedback"] as const;

export const COMPLAINT_CATEGORIES: TicketCategoryValue[] = TICKET_CATEGORIES.filter(
  (c) => !(NON_COMPLAINT_CATEGORIES as readonly string[]).includes(c),
);

/** Linked-order attribution is optional, so plan/zone views need a visible bucket. */
export const NOT_LINKED = "__not_linked__";

const list = (raw: string | undefined): string[] =>
  (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const num = (raw: string | undefined): number | undefined => {
  const n = Number(raw);
  return raw && Number.isFinite(n) ? n : undefined;
};

export function parseComplaintFilters(sp: ComplaintSearchParams): ComplaintFilters {
  return {
    from: num(sp.from),
    to: num(sp.to),
    categories: list(sp.category).filter((c) => isTicketCategory(c)),
    subcategories: list(sp.subcategory),
    statuses: list(sp.status),
    priorities: list(sp.priority),
    plans: list(sp.plan),
    zones: list(sp.zone),
  };
}

/** Serialise filters back into a querystring for a drill-through link. */
export function complaintHref(base: string, filters: Partial<ComplaintFilters> & { [k: string]: unknown }): string {
  const qs = new URLSearchParams();
  const put = (key: string, value: string[] | undefined) => {
    if (value && value.length) qs.set(key, value.join(","));
  };
  if (filters.from != null) qs.set("from", String(filters.from));
  if (filters.to != null) qs.set("to", String(filters.to));
  put("category", filters.categories);
  put("subcategory", filters.subcategories);
  put("status", filters.statuses);
  put("priority", filters.priorities);
  put("plan", filters.plans);
  put("zone", filters.zones);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * "New" is not a stored status — it is an open ticket nobody has answered yet.
 * Derived rather than migrated so no existing row needs backfilling, and so the
 * queue that actually needs a human is visible without inventing a state that
 * every transition would then have to maintain.
 */
export const NO_STAFF_REPLY = sql`not exists (
  select 1 from ticket_messages m
  where m.ticket_id = ${tickets.id} and m.author_type = 'staff'
)`;

export const IS_NEW = and(eq(tickets.status, "open"), NO_STAFF_REPLY)!;

/** Status values the UI offers, with New derived on top of the stored ones. */
export const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "waiting_on_customer", label: "Waiting for customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

function statusCondition(statuses: string[]): SQL | undefined {
  if (statuses.length === 0) return undefined;
  const stored = statuses.filter((s) => s !== "new");
  const parts: (SQL | undefined)[] = [];
  if (stored.length) parts.push(inArray(tickets.status, stored as never));
  if (statuses.includes("new")) parts.push(IS_NEW);
  return parts.length === 1 ? parts[0] : or(...(parts as SQL[]));
}

/** Plan/zone come off the linked order; NOT_LINKED selects tickets without one. */
function linkedCondition(values: string[], column: AnyPgColumn): SQL | undefined {
  if (values.length === 0) return undefined;
  const real = values.filter((v) => v !== NOT_LINKED);
  const parts: SQL[] = [];
  if (real.length) parts.push(inArray(column as never, real as never));
  if (values.includes(NOT_LINKED)) parts.push(isNull(tickets.orderId));
  return parts.length === 1 ? parts[0] : or(...parts);
}

/**
 * Every complaint query funnels through this so a filtered chart, a KPI and the
 * ticket list it links to can never disagree about which tickets are in scope.
 * `complaintsOnly` applies the Feedback exclusion; the category breakdown passes
 * false so feedback is still visible there.
 */
export function complaintWhere(
  f: ComplaintFilters,
  opts: { complaintsOnly?: boolean } = {},
): SQL | undefined {
  const parts: (SQL | undefined)[] = [];
  if (f.from != null) parts.push(gte(tickets.createdAt, f.from));
  if (f.to != null) parts.push(lte(tickets.createdAt, f.to));
  if (f.categories.length) parts.push(inArray(tickets.category, f.categories as never));
  else if (opts.complaintsOnly) parts.push(inArray(tickets.category, COMPLAINT_CATEGORIES as never));
  if (f.subcategories.length) parts.push(inArray(tickets.subcategory, f.subcategories));
  parts.push(statusCondition(f.statuses));
  if (f.priorities.length) parts.push(inArray(tickets.priority, f.priorities as never));
  parts.push(linkedCondition(f.plans, plans.key));
  parts.push(linkedCondition(f.zones, deliveryZones.name));
  const defined = parts.filter((p): p is SQL => p != null);
  return defined.length ? and(...defined) : undefined;
}

/** Shared join shape: tickets → their linked order → that order's plan/zone + customer. */
export const complaintJoins = { orders, plans, users, deliveryZones };
