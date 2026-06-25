import { PackageIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { listOrders } from "@/lib/services/orders.service";
import { parseSort } from "@/lib/list/sort";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { OrdersList } from "./orders-list";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  await requireStaff();

  const sort = parseSort(
    await searchParams,
    ["name", "deployment", "status", "start", "total", "created"],
    { column: "created", dir: "desc" },
  );

  const rows = await listOrders({ sort });
  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title="Orders" subtitle={`${rows.length} total`} />
      <SectionCard title="All orders" subtitle={rows.length === 0 ? "Nothing yet" : undefined}>
        <OrdersList rows={rows} sort={sort} />
      </SectionCard>
    </PageShell>
  );
}
