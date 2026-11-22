import { Skeleton } from "@foundry/ui/skeleton";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { parseRenewalsFilter } from "@/lib/renewals/filters";
import { RenewalsChrome } from "../renewals-chrome";
import { RenewalsListSkeleton } from "../renewals-list";

export default function Loading() {
  return (
    <RenewalsChrome
      f={parseRenewalsFilter({})}
      actions={<Skeleton className="h-9 w-24" />}
      stats={<StatCardsSkeleton count={5} />}
      list={<RenewalsListSkeleton />}
    />
  );
}
