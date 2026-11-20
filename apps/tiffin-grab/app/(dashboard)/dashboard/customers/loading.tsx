import { Skeleton } from "@foundry/ui/skeleton";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { CustomersChrome } from "./customers-chrome";
import { CustomersListSkeleton } from "./customers-list";

export default function Loading() {
  return (
    <CustomersChrome
      actions={<Skeleton className="h-9 w-32" />}
      stats={<StatCardsSkeleton count={5} />}
      showPayments
      list={<CustomersListSkeleton />}
    />
  );
}
