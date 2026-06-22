import { UsersIcon } from "lucide-react";
import { desc, eq, sql } from "drizzle-orm";
import { requireStaff } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { CustomersList } from "./customers-list";

export default async function CustomersPage() {
  await requireStaff();
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
    .orderBy(desc(sql`count(${orders.id})`))
    .limit(500);

  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customers" subtitle={`${rows.length} total`} />
      <SectionCard title="All customers" subtitle={rows.length === 0 ? "Nothing yet" : undefined}>
        <CustomersList rows={rows} />
      </SectionCard>
    </PageShell>
  );
}
