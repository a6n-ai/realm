import { cache } from "react";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { formatMoney, tzOffsetMinutes, zonedDateIso } from "@foundry/commons";
import { db } from "@/db/client";
import { orders, organization, payments } from "@/db/schema";
import { PAYMENT_REVIEW_STATUSES } from "@/lib/orders/display-status";
import { categoryLabel } from "@/lib/support/ticket-taxonomy";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { countMissedDeliveries, listMissedDeliveries } from "@/lib/services/missed-deliveries.service";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { countPaymentReviewOrders, listOrdersPage, paymentReviewWhere, visibleOrgWhere } from "@/lib/services/orders.service";
import { listRenewals } from "@/lib/services/renewals.service";
import { ticketsService } from "@/lib/services/tickets.service";
import type { RenewalsFilter } from "@/lib/renewals/filters";
import { TODAY_KINDS, TODAY_LIMIT, type TodayItem, type TodayKind } from "@/lib/today/types";

type Visible = "all" | string[];
const empty = (visible: Visible) => visible !== "all" && visible.length === 0;

/**
 * True when the user sees every franchise that exists. Day deliveries and the route push are not
 * scoped by franchise, so only these users get them. A member of the only franchise counts: "all"
 * alone is reserved for platform admins, which would hide the push card from every franchise admin.
 */
export async function coversAllOrgs(visible: Visible): Promise<boolean> {
  if (visible === "all") return true;
  if (visible.length === 0) return false;
  const ids = await db.select({ id: organization.id }).from(organization);
  return ids.every((o) => visible.includes(o.id));
}

/** Rows per type in the mixed queue, so one large backlog cannot hide every other type. */
export const PER_KIND_MIXED = 8;

/** Midnight of a calendar date (YYYY-MM-DD) in `tz`, as epoch ms. */
export function dayStartMs(iso: string, tz: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const guess = Date.UTC(y!, m! - 1, d!);
  return guess - tzOffsetMinutes(tz, guess) * 60000;
}

const weekday = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));
const monthDay = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));

/** Urgency ascending, then waiting longest, then key so the order is stable. */
export function rankTodayItems(items: TodayItem[]): TodayItem[] {
  return [...items].sort((a, b) => a.urgency - b.urgency || a.since - b.since || a.key.localeCompare(b.key));
}

// ---- payments under review: one row per payment ----

const METHOD_LABEL: Record<string, string> = { etransfer: "e-Transfer", cash: "Cash", manual: "Manual", stripe: "Card", simulated: "Simulated" };
const PAYMENT_STATUS_LABEL: Record<string, string> = { pending_verification: "claimed, to verify", awaiting_payment: "awaiting payment" };

const reviewPaymentWhere = (visible: Visible) =>
  and(paymentReviewWhere(), isNull(payments.addonRequest), inArray(payments.status, [...PAYMENT_REVIEW_STATUSES]), visibleOrgWhere(visible));

export async function countReviewPayments(visible: Visible): Promise<number> {
  if (empty(visible)) return 0;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(reviewPaymentWhere(visible));
  return count;
}

/** Payments staff still has to verify, oldest first. An order with two reviewable payments gives two rows. */
export async function listReviewPayments(visible: Visible, limit: number) {
  if (empty(visible)) return [];
  const rows = await db
    .select({
      orderId: orders.publicId,
      deploymentId: orders.deploymentId,
      customer: orders.fullName,
      paymentId: payments.publicId,
      amount: payments.amount,
      method: payments.method,
      reference: payments.reference,
      proof: payments.proof,
      status: payments.status,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(reviewPaymentWhere(visible))
    .orderBy(asc(payments.createdAt), asc(payments.id))
    .limit(limit);
  // Lazy import, as in orders.service: storage signing stays out of callers that need no proof link.
  const { attachmentHref } = await import("./ticket-attachments");
  return Promise.all(rows.map(async ({ proof, ...r }) => ({ ...r, proofUrl: proof ? await attachmentHref(proof) : null })));
}

// ---- sources ----

/** Plans ending in 2 days or less with no later plan: the renewals still winnable. */
const ENDING_FILTER: RenewalsFilter = { tab: "renewals", dateBy: "last", ending: 2, ended: null, status: "not_renewed", renewed: null, from: null, to: null, q: "" };
const NO_RANGE = { by: "last", fromIso: null, toIso: null, fromMs: null, toMs: null } as const;
const OPEN_TICKETS = { categories: [], subcategories: [], statuses: ["open", "in_progress"], priorities: [], plans: [], mealSizes: [], zones: [] };

const renewalsPage = (visible: Visible, today: string, size: number) =>
  listRenewals(visible, ENDING_FILTER, today, { page: 0, size }, NO_RANGE);
const lookoutPage = (visible: Visible, size: number) =>
  listOrdersPage(undefined, { page: 0, size }, { column: "flagged", dir: "desc" }, visible, { lookOutOnly: true });
const ticketPage = (visible: Visible, size: number, overdue: boolean) =>
  ticketsService.listQueuePage({ column: "lastMessage", dir: overdue ? "asc" : "desc" }, OPEN_TICKETS, { page: { page: 0, size }, overdue, visible });

type Source = (visible: Visible, now: number, today: string, tz: string) => Promise<TodayItem[]>;

const SOURCES: Record<TodayKind, Source> = {
  async missed(visible, _now, _today, tz) {
    const rows = (await listMissedDeliveries(visible)).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate)).slice(0, TODAY_LIMIT);
    return rows.map((r) => ({
      kind: "missed", key: `missed:${r.deliveryPublicId}`, who: r.customerName,
      what: `${weekday(r.deliveryDate)} not confirmed · ${r.planName}`,
      since: dayStartMs(r.deliveryDate, tz), urgency: 1, href: `/dashboard/orders/${r.orderPublicId}`,
    }));
  },
  async ticket(visible) {
    const [overdue, all] = await Promise.all([ticketPage(visible, TODAY_LIMIT, true), ticketPage(visible, TODAY_LIMIT, false)]);
    const item = (r: (typeof overdue.items)[number], urgency: 1 | 3): TodayItem => ({
      kind: "ticket", key: `ticket:${r.publicId}`, who: r.customerName ?? "Customer",
      what: `${categoryLabel(r.category)} · ${r.subject}`,
      since: urgency === 1 ? (r.lastMessageAt ?? r.createdAt) : r.createdAt, urgency, href: `/dashboard/tickets/${r.publicId}`,
    });
    return [...overdue.items.map((r) => item(r, 1)), ...all.items.filter((r) => !r.overdue).map((r) => item(r, 3))];
  },
  async payment(visible) {
    const rows = await listReviewPayments(visible, TODAY_LIMIT);
    return rows.map((r): TodayItem => {
      const method = METHOD_LABEL[r.method] ?? r.method;
      return {
        kind: "payment", key: `payment:${r.paymentId}`, who: r.customer,
        what: `${method} ${formatMoney(Number(r.amount))} · ${PAYMENT_STATUS_LABEL[r.status] ?? r.status}`,
        since: r.createdAt, urgency: 2, href: `/dashboard/orders/${r.orderId}`,
        // Same rule as the order page's Verify: not a card payment, and claimed or still awaiting payment.
        canVerify: r.method !== "stripe" && (r.status === "pending_verification" || r.status === "awaiting_payment"),
        payment: { orderId: r.orderId, paymentId: r.paymentId, amount: r.amount, method, reference: r.reference, proofUrl: r.proofUrl, status: r.status },
      };
    });
  },
  async renewal(visible, _now, today, tz) {
    const page = await renewalsPage(visible, today, TODAY_LIMIT);
    return page.items.map((r) => ({
      kind: "renewal", key: `renewal:${r.orderPublicId}`, who: r.customerName,
      what: `${r.planName} ends ${monthDay(r.lastTiffin)}`,
      since: dayStartMs(r.lastTiffin, tz), urgency: 2, href: "/dashboard/renewals?ending=2",
    }));
  },
  async lookout(visible) {
    const page = await lookoutPage(visible, TODAY_LIMIT);
    return page.items.map((r) => ({
      kind: "lookout", key: `lookout:${r.publicId}`, who: r.fullName, what: r.lookOutNote?.trim() || "Look out for",
      since: r.lookOutAt ?? r.createdAt, urgency: 3, href: `/dashboard/orders/${r.publicId}`,
    }));
  },
  async inquiry(visible) {
    const rows = await inquiriesService.listNew(visible, TODAY_LIMIT);
    return rows.map((r) => ({
      kind: "inquiry", key: `inquiry:${r.publicId}`, who: r.fullName, what: `New lead · ${r.source}`,
      since: r.createdAt, urgency: 3, href: `/dashboard/inquiries/${r.publicId}`,
    }));
  },
};

/**
 * The open items, most urgent first, at most 50. Each source is read with a limit of 50 before the merge,
 * so the global top 50 is right. A source that throws drops only its kind (returned in `failed`).
 */
export async function getTodayQueue(visible: Visible, now: number, kinds: readonly TodayKind[] = TODAY_KINDS) {
  if (empty(visible)) return { items: [] as TodayItem[], failed: [] as TodayKind[] };
  const { timezone } = await getAppSettings();
  const today = zonedDateIso(now, timezone);
  const settled = await Promise.allSettled(kinds.map((k) => SOURCES[k](visible, now, today, timezone)));
  const items: TodayItem[] = [];
  const failed: TodayKind[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else {
      failed.push(kinds[i]!);
      console.error(`[today] ${kinds[i]} source failed`, r.reason);
    }
  });
  // Mixed view: the most urgent few of each type. A single type (the facet) lists up to 50.
  const mixed = kinds.length > 1;
  const shown = mixed
    ? TODAY_KINDS.flatMap((k) => rankTodayItems(items.filter((i) => i.kind === k)).slice(0, PER_KIND_MIXED))
    : items;
  return { items: rankTodayItems(shown).slice(0, TODAY_LIMIT), failed };
}

// ---- totals ----

export type TodayCounts = {
  /** Exact total per queue type; null when that count failed. */
  byKind: Record<TodayKind, number | null>;
  /** Orders (not payments) with a payment waiting: the To verify tile. */
  toVerify: number | null;
  openTickets: number | null;
  overdueTickets: number | null;
  endingPlans: number | null;
  missed: number | null;
};

const settle = async <T,>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch (e) {
    console.error("[today] count failed", e);
    return null;
  }
};

/** Per-type totals and tile values; `cache` shares one read between the tiles and the queue filter. */
export const getTodayCounts = cache(async (visible: Visible, today: string): Promise<TodayCounts> => {
  if (empty(visible)) {
    return { byKind: { payment: 0, missed: 0, ticket: 0, renewal: 0, lookout: 0, inquiry: 0 }, toVerify: 0, openTickets: 0, overdueTickets: 0, endingPlans: 0, missed: 0 };
  }
  const [payment, toVerify, missed, tickets, renewal, lookout, inquiry] = await Promise.all([
    settle(countReviewPayments(visible)),
    settle(countPaymentReviewOrders(visible)),
    settle(countMissedDeliveries(visible)),
    settle(ticketPage(visible, 1, false)),
    settle(renewalsPage(visible, today, 1)),
    settle(lookoutPage(visible, 1)),
    settle(inquiriesService.countNew(visible)),
  ]);
  return {
    byKind: { payment, missed, ticket: tickets?.total ?? null, renewal: renewal?.total ?? null, lookout: lookout?.total ?? null, inquiry },
    toVerify,
    openTickets: tickets?.total ?? null,
    overdueTickets: tickets?.overdueCount ?? null,
    endingPlans: renewal?.total ?? null,
    missed,
  };
});
