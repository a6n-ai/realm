import { Skeleton } from "@/components/customer/kit";

// Mirrors the weekly menu: header, glass week bar, day title, status card, then a grid of dish cards.
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-1 h-6 w-36" />
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-[68px] rounded-[28px]" />
        <div className="flex flex-col gap-2 px-1">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-40" />
        </div>
        <Skeleton className="h-[72px] rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-[116px] rounded-3xl" />)}
        </div>
      </div>
    </div>
  );
}
