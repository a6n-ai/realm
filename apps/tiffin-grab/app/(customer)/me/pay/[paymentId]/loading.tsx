import { Card, PageHeader, Skeleton } from "@/components/customer/kit";

// PayForm's frame: header, then one card with the plan, price lines and the card form.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto flex max-w-lg flex-col gap-5">
      <PageHeader eyebrow="Payment" title="Pay by" accent="card" />
      <Card className="flex flex-col gap-4 p-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-5" />)}
        </div>
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-36" />
        <Skeleton className="h-[50px] rounded-[14px]" />
      </Card>
    </div>
  );
}
