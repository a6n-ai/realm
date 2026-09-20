import { Suspense } from "react";
import { asc, desc, eq, ilike, inArray, and, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { orderActivities, orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { parseFilterState } from "@/components/ds";
import { LOG_EVENT_OPTIONS, LOG_SORT_KEYS } from "../payment-facets";
import { LogsTable, LogsTableSkeleton } from "./logs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function ProviderLogsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<LogsTableSkeleton />}>
      <LogsData searchParams={searchParams} />
    </Suspense>
  );
}

// ponytail: no provider-callback table exists yet (e-transfer is manual). This is the payment
// slice of the order activity log; add a provider_events table when an online provider lands.
async function LogsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const sort = parseSort(sp, LOG_SORT_KEYS, { column: "time", dir: "desc" });
  const events = (sp.event ?? "").split(",").filter((e) => LOG_EVENT_OPTIONS.some((o) => o.value === e));
  const actor = alias(users, "actor");
  const col = { time: orderActivities.createdAt, event: orderActivities.type, order: orders.publicId, by: actor.email }[sort.column];

  const { page } = parseFilterState([], sp);
  const where = and(
    inArray(orderActivities.type, events.length ? (events as never[]) : ["payment_claimed", "payment_verified", "payment_rejected"]),
    q ? or(ilike(orders.publicId, `%${q}%`), ilike(orderActivities.note, `%${q}%`), ilike(actor.email, `%${q}%`)) : undefined,
  );

  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(orderActivities)
    .innerJoin(orders, eq(orders.id, orderActivities.orderId))
    .leftJoin(actor, eq(actor.id, orderActivities.createdBy))
    .where(where);

  const rows = await db
    .select({
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
    .where(where)
    .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
    .limit(page.size)
    .offset(page.page * page.size);

  return <LogsTable rows={rows} total={total} page={page.page} size={page.size} sort={sort} />;
}
