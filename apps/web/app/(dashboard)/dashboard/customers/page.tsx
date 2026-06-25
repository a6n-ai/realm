import { UsersIcon } from "lucide-react";
import { asc, desc, eq, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { parseSort, type SortState } from "@/lib/list/sort";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { CustomersList } from "./customers-list";

const SORT_COL = {
  email: users.email,
  phone: users.phone,
  orders: sql`count(${orders.id})`,
} as const;

type CustomerSortColumn = keyof typeof SORT_COL;

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort: SortState<CustomerSortColumn> = parseSort(
    await searchParams,
    ["email", "phone", "orders"],
    { column: "orders", dir: "desc" },
  );

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const rows = await db
    .select({
      publicId: users.publicId,
      email: users.email,
      phone: users.phone,
      orderCount: sql<number>`count(${orders.id})`.mapWith(Number),
      latestStatus: sql<string | null>`(array_agg(${orders.status} order by ${orders.createdAt} desc))[1]`,
    })
    .from(users)
    .leftJoin(orders, eq(orders.userId, users.id))
    .where(eq(users.role, "user"))
    .groupBy(users.id, users.publicId, users.email, users.phone)
    .orderBy(orderBy)
    .limit(500);

  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customers" subtitle={`${rows.length} total`} />
      <SectionCard title="All customers" subtitle={rows.length === 0 ? "Nothing yet" : undefined}>
        <CustomersList rows={rows} sort={sort} />
      </SectionCard>
    </PageShell>
  );
}

export type { CustomerSortColumn };
