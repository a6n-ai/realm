import { PackageIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { listOrders } from "@/lib/services/orders.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { OrdersList } from "./orders-list";

export default async function OrdersPage() {
  await requireStaff();
  const rows = await listOrders();
  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title="Orders" subtitle={`${rows.length} total`} />
      <SectionCard title="All orders" subtitle={rows.length === 0 ? "Nothing yet" : undefined}>
        <OrdersList rows={rows} />
      </SectionCard>
    </PageShell>
  );
}
