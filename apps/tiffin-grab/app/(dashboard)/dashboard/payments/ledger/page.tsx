import { Suspense } from "react";
import { and, asc, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { ledgerEntries, orders, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { parseFilterState, SectionCard } from "@/components/ds";
import { dateRangeWhere } from "../payment-queries";
import { LEDGER_SORT_KEYS, LEDGER_TYPE_OPTIONS } from "../payment-facets";
import { MoneyLedgerTable, MoneyLedgerTableSkeleton } from "./money-ledger-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const SORT_COL = {
  time: ledgerEntries.createdAt,
  customer: users.email,
  type: ledgerEntries.type,
  order: orders.publicId,
  amount: ledgerEntries.amount,
} as const;

export default function MoneyLedgerPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard title="Ledger">
      <Suspense fallback={<MoneyLedgerTableSkeleton />}>
        <MoneyLedgerData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
  );
}

async function MoneyLedgerData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = sp.q?.trim();
  const sort = parseSort(sp, LEDGER_SORT_KEYS, { column: "time", dir: "desc" });
  const types = (sp.type ?? "").split(",").filter((t) => LEDGER_TYPE_OPTIONS.some((o) => o.value === t));
  const col = SORT_COL[sort.column];
  const { page } = parseFilterState([], sp);
  const where = and(
    types.length ? inArray(ledgerEntries.type, types as never[]) : undefined,
    dateRangeWhere(ledgerEntries.createdAt, sp),
    q
      ? or(
          ilike(ledgerEntries.memo, `%${q}%`),
          ilike(users.email, `%${q}%`),
          ilike(orders.publicId, `%${q}%`),
          sql`${ledgerEntries.type}::text ilike ${`%${q}%`}`,
        )
      : undefined,
  );

  const [{ total }] = await db
    .select({ total: sql<number>`cast(count(*) as int)` })
    .from(ledgerEntries)
    .leftJoin(users, eq(users.id, ledgerEntries.userId))
    .leftJoin(orders, eq(orders.id, ledgerEntries.orderId))
    .where(where);

  const rows = await db
    .select({
      publicId: ledgerEntries.publicId,
      createdAt: ledgerEntries.createdAt,
      direction: ledgerEntries.direction,
      type: ledgerEntries.type,
      amount: ledgerEntries.amount,
      memo: ledgerEntries.memo,
      email: users.email,
      orderPublicId: orders.publicId,
    })
    .from(ledgerEntries)
    .leftJoin(users, eq(users.id, ledgerEntries.userId))
    .leftJoin(orders, eq(orders.id, ledgerEntries.orderId))
    .where(where)
    .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
    .limit(page.size)
    .offset(page.page * page.size);

  return <MoneyLedgerTable rows={rows} total={total} page={page.page} size={page.size} sort={sort} />;
}
