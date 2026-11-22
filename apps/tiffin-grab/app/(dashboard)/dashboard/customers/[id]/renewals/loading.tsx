import { Skeleton } from "@foundry/ui/skeleton";
import { RenewalSectionsSkeleton } from "../../../renewals/customers/[id]/renewal-sections-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <Skeleton className="h-9 w-40" />
      <RenewalSectionsSkeleton />
    </div>
  );
}
