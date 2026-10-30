import { Skeleton } from "@/components/customer/kit";

// Mirrors the weekly menu: header, glass week bar, day title, status card, then each category heading over its dish cards.
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
        {[4, 2].map((n, i) => (
          <div key={i} className="flex flex-col gap-3">
            <div className="flex items-center gap-3 px-1">
              <Skeleton className="size-8 rounded-lg" />
              <Skeleton className="h-5 w-24" />
            </div>
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: n }, (_, j) => <Skeleton key={j} className="h-16 flex-[1_1_10rem] rounded-2xl" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
