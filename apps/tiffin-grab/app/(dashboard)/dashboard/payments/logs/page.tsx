import { Suspense } from "react";
import { asc, desc, eq, ilike, inArray, and, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { orderActivities, orders, payments, stripeEvents, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { parseFilterState, SectionCard } from "@/components/ds";
import { dateRangeWhere } from "../payment-queries";
import { LOG_EVENT_OPTIONS, LOG_SORT_KEYS, STRIPE_EVENT_FILTER } from "../payment-facets";
import { LogsTable, LogsTableSkeleton } from "./logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function ProviderLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Provider logs">
      <Suspense fallback={<LogsTableSkeleton />}>
        <LogsData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

export type LogRow = {
  key: string;
  createdAt: number;
  type: string;
  note: string | null;
  actorEmail: string | null;
  orderPublicId: string | null;
  /** Set for stripe_events rows that failed; powers the Reprocess action. */
  failedEventId: string | null;
};

const CMP = {
  time: (r: LogRow) => r.createdAt,
  event: (r: LogRow) => r.type,
  order: (r: LogRow) => r.orderPublicId ?? "",
  by: (r: LogRow) => r.actorEmail ?? "",
} as const;

// Activity rows and stripe_events are two tables, so the page is merged in memory: each source
// yields its first (offset + size) rows in the chosen order, the union is sorted and sliced.
async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const sort = parseSort(sp, LOG_SORT_KEYS, { column: "time", dir: "desc" });
  const picked = (sp.event ?? "").split(",").filter((e) => LOG_EVENT_OPTIONS.some((o) => o.value === e));
  const wantStripe = picked.length === 0 || picked.includes(STRIPE_EVENT_FILTER);
  const activityTypes = picked.filter((e) => e !== STRIPE_EVENT_FILTER);
  const wantActivity = picked.length === 0 || activityTypes.length > 0;
  const actor = alias(users, "actor");

  const { page } = parseFilterState([], sp);
  const take = (page.page + 1) * page.size;
  const dir = sort.dir === "asc" ? asc : desc;

  const actWhere = and(
    inArray(orderActivities.type, activityTypes.length ? (activityTypes as never[]) : ["payment_claimed", "payment_verified", "payment_rejected"]),
    dateRangeWhere(orderActivities.createdAt, sp),
    q ? or(ilike(orders.publicId, `%${q}%`), ilike(orderActivities.note, `%${q}%`), ilike(actor.email, `%${q}%`)) : undefined,
  );
  const evWhere = and(
    dateRangeWhere(stripeEvents.receivedAt, sp),
    q ? or(ilike(orders.publicId, `%${q}%`), ilike(stripeEvents.type, `%${q}%`), ilike(stripeEvents.error, `%${q}%`), ilike(stripeEvents.eventId, `%${q}%`)) : undefined,
  );
  const actCol = { time: orderActivities.createdAt, event: orderActivities.type, order: orders.publicId, by: actor.email }[sort.column];
  const evCol = { time: stripeEvents.receivedAt, event: stripeEvents.type, order: orders.publicId, by: sql`${"Stripe"}` }[sort.column];

  const [actCount, actRows, evCount, evRows] = await Promise.all([
    wantActivity
      ? db.select({ total: sql<number>`cast(count(*) as int)` }).from(orderActivities)
          .innerJoin(orders, eq(orders.id, orderActivities.orderId))
          .leftJoin(actor, eq(actor.id, orderActivities.createdBy))
          .where(actWhere)
      : [{ total: 0 }],
    wantActivity
      ? db.select({
            publicId: orderActivities.publicId,
            createdAt: orderActivities.createdAt,
            type: orderActivities.type,
            note: orderActivities.note,
            actorEmail: actor.email,
            orderPublicId: orders.publicId,
          })
          .from(orderActivities)
          .innerJoin(orders, eq(orders.id, orderActivities.orderId))
          .leftJoin(actor, eq(actor.id, orderActivities.createdBy))
          .where(actWhere)
          .orderBy(dir(actCol), dir(orderActivities.id))
          .limit(take)
      : [],
    wantStripe
      ? db.select({ total: sql<number>`cast(count(*) as int)` }).from(stripeEvents)
          .leftJoin(payments, eq(payments.id, stripeEvents.paymentId))
          .leftJoin(orders, eq(orders.id, payments.orderId))
          .where(evWhere)
      : [{ total: 0 }],
    wantStripe
      ? db.select({
            eventId: stripeEvents.eventId,
            receivedAt: stripeEvents.receivedAt,
            type: stripeEvents.type,
            error: stripeEvents.error,
            paymentPublicId: payments.publicId,
            orderPublicId: orders.publicId,
          })
          .from(stripeEvents)
          .leftJoin(payments, eq(payments.id, stripeEvents.paymentId))
          .leftJoin(orders, eq(orders.id, payments.orderId))
          .where(evWhere)
          .orderBy(dir(evCol), dir(stripeEvents.eventId))
          .limit(take)
      : [],
  ]);

  const merged: LogRow[] = [
    ...actRows.map((r) => ({ key: r.publicId, createdAt: r.createdAt, type: r.type, note: r.note, actorEmail: r.actorEmail, orderPublicId: r.orderPublicId, failedEventId: null })),
    ...evRows.map((r) => ({
      key: r.eventId,
      createdAt: r.receivedAt,
      type: `stripe:${r.type}`,
      note: [r.paymentPublicId, r.error ?? "processed"].filter(Boolean).join(" · "),
      actorEmail: "Stripe",
      orderPublicId: r.orderPublicId,
      failedEventId: r.error ? r.eventId : null,
    })),
  ];
  const key = CMP[sort.column];
  const sign = sort.dir === "asc" ? 1 : -1;
  merged.sort((a, b) => (key(a) < key(b) ? -sign : key(a) > key(b) ? sign : 0));
  const rows = merged.slice(page.page * page.size, take);

  return <LogsTable rows={rows} total={actCount[0]!.total + evCount[0]!.total} page={page.page} size={page.size} sort={sort} />;
}
