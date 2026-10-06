import { and, eq, sql } from "drizzle-orm";
import type { Condition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql, pageOrder } from "@foundry/database";
import { db } from "@/db/client";
import { bookings, payments, users } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";

export type CustomerSortColumn = "name" | "email" | "joined" | "bookings" | "spent" | "lastBooking";

export type CustomerRow = {
  publicId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: number;
  bookingCount: number;
  totalSpent: string;
  lastBookingAt: number | null;
};

// Correlated, so the bookings join below cannot multiply the payment sum. `users.id`
// is spelled out: drizzle drops the table prefix on single-table selects, which
// would bind a bare "id" to the subquery's own table.
// Only verified money counts: pending and rejected payments are not spend.
const SPENT_SQL = sql<string>`(select coalesce(sum(p.amount), 0)::numeric(10,2)::text from ${payments} p where p.user_id = users.id and p.status = 'paid')`;
const BOOKINGS_SQL = sql<number>`count(${bookings.id}) filter (where ${bookings.status} <> 'cancelled')`;
const LAST_BOOKING_SQL = sql<string | null>`max(${bookings.createdAt})`;

/** Customers = `users` with role `user` (families). Staff never appear. */
export async function listCustomersPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<CustomerSortColumn> = { column: "joined", dir: "desc" },
): Promise<Page<CustomerRow>> {
  const where = and(
    eq(users.role, "user"),
    conditionToSql(
      condition,
      columnResolver({
        name: users.name,
        email: users.email,
        phone: users.phone,
        status: users.status,
        createdAt: users.createdAt,
      }),
    ),
  );

  const SORT_COL = {
    name: users.name,
    email: users.email,
    joined: users.createdAt,
    bookings: BOOKINGS_SQL,
    spent: sql`(${SPENT_SQL})::numeric`,
    lastBooking: LAST_BOOKING_SQL,
  } as const;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: users.publicId,
        name: users.name,
        email: users.email,
        phone: users.phone,
        status: users.status,
        createdAt: users.createdAt,
        bookingCount: BOOKINGS_SQL.mapWith(Number),
        totalSpent: SPENT_SQL,
        lastBookingAt: LAST_BOOKING_SQL,
      })
      .from(users)
      .leftJoin(bookings, eq(bookings.userId, users.id))
      .where(where)
      .groupBy(users.id)
      .orderBy(...pageOrder(sort.dir, SORT_COL[sort.column] ?? users.createdAt, users.id))
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ count: sql<number>`cast(count(*) as int)` }).from(users).where(where),
  ]);

  const items = rows.map((r) => ({ ...r, lastBookingAt: r.lastBookingAt == null ? null : Number(r.lastBookingAt) }));
  return { items, page: page.page, size: page.size, total: count };
}

export type CustomerStats = { total: number; active: number; withBookings: number; newThisWeek: number };

export async function customerStats(now = Date.now()): Promise<CustomerStats> {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const [row] = await db
    .select({
      total: sql<number>`cast(count(*) as int)`,
      active: sql<number>`cast(count(*) filter (where ${users.status} = 'active') as int)`,
      withBookings: sql<number>`cast(count(*) filter (where exists (select 1 from ${bookings} b where b.user_id = users.id and b.status <> 'cancelled')) as int)`,
      newThisWeek: sql<number>`cast(count(*) filter (where ${users.createdAt} >= ${weekAgo}) as int)`,
    })
    .from(users)
    .where(eq(users.role, "user"));
  return row!;
}
