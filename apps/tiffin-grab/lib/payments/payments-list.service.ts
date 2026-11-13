import { DAY_MS } from "@foundry/commons/util/dates";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { eq, ilike, inArray, or, sql, and, type SQL } from "drizzle-orm";
import { pageOrder } from "@foundry/database";
import { parseFilterState } from "@/components/ds";
import { db } from "@/db/client";
import { ledgerEntries, notificationOutbox, orderActivities, orders, payments, stripeEvents, users } from "@/db/schema";
import type { SendState } from "@/lib/services/customers.service";
import { NOTE_AMOUNT_MISMATCH, NOTE_CANCELLED_ORDER, NOTE_CC_NO_SURCHARGE, NOTE_DUPLICATE_CHARGE, NOTE_PI_OTHER_PAYMENT } from "@/lib/payments/stripe-notes";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";
import { epochBoundsWhere, epochBoundsWhereSql, withListDates } from "@/lib/list/default-month";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";
import { proofView } from "@/lib/services/ticket-attachments";
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_SORT_KEYS,
  PAYMENT_STATUS_OPTIONS,
  STRIPE_FACETS,
  type PaymentRow,
  type PaymentSortKey,
} from "@/lib/payments/facets";

/** Same instant revenue analytics bucket by: capture when present, else created. */
const moneyDate = sql`coalesce(${payments.capturedAt}, ${payments.createdAt})`;

const SORT_COL = {
  time: payments.createdAt,
  customer: users.email,
  order: orders.publicId,
  method: payments.method,
  status: payments.status,
  amount: payments.amount,
} as const;

type Sp = { q?: string; sort?: string; dir?: string; status?: string; method?: string; attention?: string; owner?: string; from?: string; to?: string; basis?: string };

/** The date picker writes epoch-ms `from`/`to` params; either end may be open. */
// Prefixes written to order_activities (type payment_failed) by payment-stripe.ts when a card payment needs staff.
const FLAGGED_NOTES = [
  `${NOTE_AMOUNT_MISMATCH} %`,
  `${NOTE_PI_OTHER_PAYMENT} % belongs to another payment%`,
  `${NOTE_CANCELLED_ORDER} %`,
  `${NOTE_CC_NO_SURCHARGE} %`,
  `${NOTE_DUPLICATE_CHARGE} %`,
];

const activityExists = (cond: SQL) =>
  sql`exists (select 1 from ${orderActivities} oa where oa.order_id = ${payments.orderId} and ${cond})`;

/** One OR-ed condition per selected "needs attention" facet value. */
function attentionWhere(values: string[]): SQL | undefined {
  const conds = values.map((v): SQL => {
    switch (v) {
      case "stuck":
        return sql`(${payments.status} = 'awaiting_payment' and ${payments.providerRef} is not null and ${payments.createdAt} < ${Date.now() - 120_000})`;
      case "failed":
        return activityExists(sql`oa.type = 'payment_failed' and oa.created_at > ${Date.now() - 7 * DAY_MS}`);
      case "flagged":
        return activityExists(sql`oa.type = 'payment_failed' and (${sql.join(FLAGGED_NOTES.map((n) => sql`oa.note like ${n}`), sql` or `)})`);
      case "disputed":
        return activityExists(sql`oa.type = 'payment_disputed'`);
      case "event_error":
        return sql`exists (select 1 from ${stripeEvents} se where se.payment_id = ${payments.id} and se.error is not null)`;
      default:
        return sql`${payments.taxSource} = 'fallback'`;
    }
  });
  return conds.length ? or(...conds) : undefined;
}

const csv = (v: string | undefined, allowed: readonly { value: string }[]) =>
  (v ?? "")
    .split(",")
    .filter((x) => allowed.some((a) => a.value === x));

export const OVERDUE_DAYS = 3;

export type PaymentKpis = {
  range: { from: number; to: number };
  collected: number;
  collectedCount: number;
  ordersPaid: number;
  previousCollected: number;
  toVerify: { count: number; oldestAt: number | null };
  awaiting: { count: number; amount: number };
  overdue: { count: number; amount: number };
  rejectedCount: number;
  /** Awaiting payment on a link that has passed its expiry (void links are rejected, so not counted). */
  expired: { count: number; amount: number };
};

/**
 * Headline numbers above the payments tabs. Every card follows the date range (by `created_at`,
 * same as the table), so a card always counts the rows the table shows.
 */
export async function getPaymentKpis(
  sp: { from?: string; to?: string },
  now = Date.now(),
  method?: "etransfer" | "stripe",
): Promise<PaymentKpis> {
  const dated = await withListDates(sp);
  const from = Number(dated.from);
  const to = Number(dated.to);
  // The equal-length window just before this one.
  const prevTo = from - 1;
  const prevFrom = prevTo - (to - from);
  const overdueBefore = now - OVERDUE_DAYS * DAY_MS;
  const inRange = (a: number, b: number) => sql`${payments.createdAt} between ${a} and ${b}`;
  const num = (v: unknown) => Number(v ?? 0);
  const cur = inRange(from, to);
  const expired = sql`${payments.status} = 'awaiting_payment' and ${payments.expiresAt} > 0 and ${payments.expiresAt} <= ${now} and ${cur}`;

  const [r] = await db
    .select({
      collected: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'paid' and ${inRange(from, to)}), 0)`,
      collectedCount: sql<number>`cast(count(*) filter (where ${payments.status} = 'paid' and ${inRange(from, to)}) as int)`,
      ordersPaid: sql<number>`cast(count(distinct ${payments.orderId}) filter (where ${payments.status} = 'paid' and ${inRange(from, to)}) as int)`,
      previousCollected: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'paid' and ${inRange(prevFrom, prevTo)}), 0)`,
      verifyCount: sql<number>`cast(count(*) filter (where ${payments.status} = 'pending_verification' and ${cur}) as int)`,
      verifyOldestAt: sql<string | null>`min(coalesce(${payments.claimedAt}, ${payments.createdAt})) filter (where ${payments.status} = 'pending_verification' and ${cur})`,
      awaitingCount: sql<number>`cast(count(*) filter (where ${payments.status} = 'awaiting_payment' and ${cur}) as int)`,
      awaitingAmount: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'awaiting_payment' and ${cur}), 0)`,
      overdueCount: sql<number>`cast(count(*) filter (where ${payments.status} = 'awaiting_payment' and ${payments.createdAt} < ${overdueBefore} and ${cur}) as int)`,
      overdueAmount: sql<string>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'awaiting_payment' and ${payments.createdAt} < ${overdueBefore} and ${cur}), 0)`,
      rejectedCount: sql<number>`cast(count(*) filter (where ${payments.status} = 'rejected' and ${inRange(from, to)}) as int)`,
      expiredCount: sql<number>`cast(count(*) filter (where ${expired}) as int)`,
      expiredAmount: sql<string>`coalesce(sum(${payments.amount}) filter (where ${expired}), 0)`,
    })
    .from(payments)
    .where(method ? eq(payments.method, method) : undefined);

  return {
    range: { from, to },
    collected: num(r.collected),
    collectedCount: r.collectedCount,
    ordersPaid: r.ordersPaid,
    previousCollected: num(r.previousCollected),
    toVerify: { count: r.verifyCount, oldestAt: r.verifyOldestAt == null ? null : Number(r.verifyOldestAt) },
    awaiting: { count: r.awaitingCount, amount: num(r.awaitingAmount) },
    overdue: { count: r.overdueCount, amount: num(r.overdueAmount) },
    rejectedCount: r.rejectedCount,
    expired: { count: r.expiredCount, amount: num(r.expiredAmount) },
  };
}

/** Card payments matching any "Needs attention" facet except fallback tax: the same rows that filter shows. */
export async function countStripeAttention(sp: { from?: string; to?: string }): Promise<number> {
  const dated = await withListDates(sp);
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(payments)
    .where(and(eq(payments.method, "stripe"), epochBoundsWhere(payments.createdAt, dated), attentionWhere(["stuck", "failed", "flagged", "disputed", "event_error"])));
  return count;
}

/** Ledger totals by type inside the date range; credit is money in, debit money out. */
export async function getLedgerKpis(sp: { from?: string; to?: string }) {
  const dated = await withListDates(sp);
  const rows = await db
    .select({
      type: ledgerEntries.type,
      direction: ledgerEntries.direction,
      amount: sql<string>`coalesce(sum(${ledgerEntries.amount}), 0)`,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(ledgerEntries)
    .where(epochBoundsWhere(ledgerEntries.createdAt, dated))
    .groupBy(ledgerEntries.type, ledgerEntries.direction);
  const total = (type: string) => {
    const hit = rows.filter((r) => r.type === type);
    return { amount: hit.reduce((a, r) => a + Number(r.amount), 0), count: hit.reduce((a, r) => a + r.count, 0) };
  };
  const signed = (dir: string) => rows.filter((r) => r.direction === dir).reduce((a, r) => a + Number(r.amount), 0);
  return {
    payment: total("payment"),
    refund: total("refund"),
    discount: total("discount"),
    adjustment: total("adjustment"),
    net: signed("credit") - signed("debit"),
  };
}

/** Counts behind the Provider logs tab, dated like its rows. */
export async function getLogKpis(sp: { from?: string; to?: string }) {
  const dated = await withListDates(sp);
  const actType = (t: string) => sql<number>`cast(count(*) filter (where ${orderActivities.type} = ${t}) as int)`;
  const [[a], [e]] = await Promise.all([
    db
      .select({
        claimed: actType("payment_claimed"),
        verified: actType("payment_verified"),
        rejected: actType("payment_rejected"),
        failed: actType("payment_failed"),
      })
      .from(orderActivities)
      .where(epochBoundsWhere(orderActivities.createdAt, dated)),
    db
      .select({
        events: sql<number>`cast(count(*) as int)`,
        errors: sql<number>`cast(count(*) filter (where ${stripeEvents.error} is not null) as int)`,
      })
      .from(stripeEvents)
      .where(epochBoundsWhere(stripeEvents.receivedAt, dated)),
  ]);
  return { ...a, events: a.claimed + a.verified + a.rejected + e.events, webhooks: e.events, webhookErrors: e.errors };
}

/** Order owner by staff publicId; "none" = unowned. Unknown ids match nothing. */
function ownerWhere(v?: string) {
  if (!v) return undefined;
  if (v === UNASSIGNED_OWNER) return sql`${payments.orderId} in (select id from ${orders} where current_owner is null)`;
  return sql`${payments.orderId} in (select id from ${orders} where current_owner in (select id from ${users} where public_id = ${v}))`;
}

/** Newest first by default, server-paginated like Orders. `where` pins a tab's own rule. */
export async function listPayments(
  sp: Sp,
  opts: { where?: SQL; allTime?: boolean; unpaged?: boolean } = {},
): Promise<{ rows: PaymentRow[]; total: number; page: number; size: number; sort: SortState<PaymentSortKey> }> {
  // The customer tab has no date picker, so it lists every payment instead of the default month.
  const dated = opts.allTime ? { ...sp, from: undefined, to: undefined } : await withListDates(sp);
  const { page } = parseFilterState([], dated);
  const sort = parseSort(dated, PAYMENT_SORT_KEYS, { column: "time", dir: "desc" });
  const q = dated.q?.trim();
  const statuses = csv(dated.status, PAYMENT_STATUS_OPTIONS);
  const methods = csv(dated.method, PAYMENT_METHOD_OPTIONS);
  const attention = csv(dated.attention, STRIPE_FACETS);

  const where = and(
    opts.where,
    statuses.length ? inArray(payments.status, statuses as never[]) : undefined,
    methods.length ? inArray(payments.method, methods as never[]) : undefined,
    // basis=money is the analytics drill: dated by when the money moved, like the revenue tiles.
    dated.basis === "money"
      ? epochBoundsWhereSql(moneyDate, dated)
      : epochBoundsWhere(payments.createdAt, dated),
    attentionWhere(attention),
    ownerWhere(dated.owner),
    q
      ? or(
          ilike(orders.publicId, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(payments.reference, `%${q}%`),
          sql`${payments.method}::text ilike ${`%${q}%`}`,
        )
      : undefined,
  );

  // Sort the Time column on the same clock the range filter uses (capture for money drills).
  const col = sort.column === "time" && dated.basis === "money" ? moneyDate : SORT_COL[sort.column];
  const [[{ total }], rows] = await Promise.all([
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where),
    db
      .select({
        publicId: payments.publicId,
        createdAt: payments.createdAt,
        status: payments.status,
        method: payments.method,
        amount: payments.amount,
        reference: payments.reference,
        proof: payments.proof,
        claimedAt: payments.claimedAt,
        capturedAt: payments.capturedAt,
        note: payments.note,
        name: users.name,
        email: users.email,
        phone: users.phone,
        customerPublicId: users.publicId,
        orderPublicId: orders.publicId,
        providerRef: payments.providerRef,
        providerCheckedAt: payments.providerCheckedAt,
        cardBrand: payments.cardBrand,
        cardLast4: payments.cardLast4,
        surchargeAmount: payments.surchargeAmount,
        taxSource: payments.taxSource,
        isAddon: sql<boolean>`${payments.addonRequest} is not null`,
        expiresAt: payments.expiresAt,
        // Latest payment-reminder email for this order (its vars carry the order code).
        lastReminder: sql<SendState | null>`(select json_build_object('status', o.status, 'at', o.created_at, 'deliveredAt', o.delivered_at, 'openedAt', o.opened_at)
          from ${notificationOutbox} o
          where o.event = 'payment_reminder' and o.channel = 'email' and o.recipient_email = ${users.email}
            and o.payload->'vars'->'payment'->>'orderCode' = ${orders.deploymentId}
          order by o.created_at desc limit 1)`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .leftJoin(users, eq(users.id, orders.userId))
      .where(where)
      .orderBy(...pageOrder(sort.dir, col, payments.id))
      // shortcut: unpaged (exports) caps at 10k rows, fine for one customer; stream if it backs a global export.
      .limit(opts.unpaged ? 10_000 : page.size)
      .offset(opts.unpaged ? 0 : pageOffset(page.page, page.size)),
  ]);

  return {
    rows: await Promise.all(
      rows.map(async ({ proof, ...r }) => {
        const view = await proofView(proof, [`payments/${r.publicId}`, `payments/${r.orderPublicId}`]);
        return { ...r, proofThumb: view?.thumbUrl ?? null, proofHref: view?.href ?? null, proofName: proof?.name ?? null };
      }),
    ),
    total,
    page: page.page,
    size: page.size,
    sort,
  };
}
