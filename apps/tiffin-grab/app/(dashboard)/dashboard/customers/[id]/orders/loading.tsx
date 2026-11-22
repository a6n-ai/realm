import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard, SkeletonTable } from "@/components/ds";
import { PaymentsTableSkeleton } from "../../../payments/payments-table";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <Skeleton className="h-28 w-full" />
      <SectionCard title="Orders">
        <SkeletonTable columns={6} rows={4} />
      </SectionCard>
      <SectionCard title="Delivery addresses" subtitle="Plans follow the default saved address. A change applies from the next delivery whose cutoff hasn't passed.">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-10 w-full" />
        </div>
      </SectionCard>
      <SectionCard title="Payments" action={<Skeleton className="h-9 w-24" />}>
        <PaymentsTableSkeleton scope="customer" />
      </SectionCard>
    </div>
  );
}
