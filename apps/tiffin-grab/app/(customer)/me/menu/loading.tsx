import { Skeleton } from "@/components/customer/kit";

// Mirrors the weekly menu: header, glass week bar, day title, status card, then inset-grouped dish lists.
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="mx-4 h-3 w-16" />
              <Skeleton className="h-[148px] rounded-3xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
