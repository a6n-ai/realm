import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { UsersIcon } from "lucide-react";
import { PageShell, PageHeader } from "@/components/ds";
import { Skeleton } from "@foundry/ui/skeleton";
import { MAX_REVIEW_ROWS, listOrderCities } from "@/lib/services/customer-payouts.service";
import { NewGroupWizard } from "./new-group-wizard";

export default function NewCustomerGroupPage() {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customer groups" />
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <NewGroupData />
      </Suspense>
    </PageShell>
  );
}

async function NewGroupData() {
  await requireAdmin();
  const cities = await listOrderCities();
  return <NewGroupWizard cities={cities} maxRows={MAX_REVIEW_ROWS} />;
}
