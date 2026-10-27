"use client";

import { useSearchParams } from "next/navigation";
import { Card, Skeleton } from "@/components/customer/kit";
import { BottomBarSkeleton } from "@/components/wizard/bottom-bar-skeleton";
import { ChromeSkeleton } from "@/components/wizard/chrome-skeleton";
import { ProgressSkeleton } from "@/components/wizard/progress-skeleton";

// One route, two forms: ?full=1 (a new plan) and a staff quote (?p=) open the plan builder on its first
// question; a plain /me/renew is the one-page quick renew. A client loader so it can read the URL it is
// loading for (loading.tsx gets no searchParams).
export default function Loading() {
  const params = useSearchParams();
  return params.get("full") === "1" || params.has("p") ? <PlanBuilderSkeleton /> : <QuickRenewSkeleton />;
}

function Hint({ className }: { className: string }) {
  return <Skeleton className={`rounded-2xl ${className}`} />;
}

/** The builder's first question: stepper, two-line heading on phones, current-plan note, the two plan cards. */
function PlanBuilderSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-3xl pb-[calc(7rem+1rem)] sm:pb-10">
      <ChromeSkeleton />
      <ProgressSkeleton />
      <div className="mb-6 space-y-2">
        <Skeleton className="h-[30px] w-64 max-w-full sm:h-[38px] sm:w-96" />
        <Skeleton className="h-[30px] w-40 sm:hidden" />
      </div>
      <div className="space-y-4">
        <Hint className="h-[70px] sm:h-10" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="c-surface flex min-h-24 items-center justify-between gap-4 rounded-[20px] bg-[var(--card)] p-4">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-[22px] w-48 max-w-full" />
                <Skeleton className="h-4 w-full max-w-64" />
                <Skeleton className="h-4 w-24 sm:hidden" />
              </div>
              <Skeleton className="size-11 shrink-0 rounded-full" />
            </div>
          ))}
        </div>
      </div>
      <BottomBarSkeleton />
    </div>
  );
}

/** Quick renew inside Checkout's frame: plan card, current-plan note, start date, weeks slider, the week
 *  schedule card, the order summary (md+) and the action bar. */
function QuickRenewSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-5xl pb-[calc(7rem+1rem)] sm:pb-10">
      <ChromeSkeleton chip />
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[minmax(0,1fr)_340px] md:items-start lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
        <div className="min-w-0">
          <ProgressSkeleton />
          <Skeleton className="mb-6 h-[30px] w-64 sm:h-[38px]" />
          <div className="flex flex-col gap-6">
            <Card className="px-4 py-4">
              <div className="flex items-center gap-2">
                <Skeleton className="h-[26px] w-48" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <Skeleton className="mt-1.5 h-4 w-40" />
              <Skeleton className="mt-3 h-11 w-44 rounded-full" />
            </Card>
            <div className="space-y-6">
              <Hint className="h-[54px] sm:h-10" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-[52px]" />
                <Skeleton className="h-4 w-full max-w-80" />
              </div>
              <div>
                <Skeleton className="h-4 w-40" />
                <div className="mt-3 space-y-2">
                  <div className="mx-3.5 flex h-6 items-end justify-around">
                    {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-4 w-9" />)}
                  </div>
                  <Skeleton className="h-7 w-full rounded-full" />
                  <div className="mx-3.5 flex h-4 justify-between">
                    {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-3.5 w-4" />)}
                  </div>
                  <Skeleton className="mt-1 h-[22px] w-56" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <div className="c-surface rounded-[20px] bg-[var(--card)] p-5">
                <div className="flex items-end justify-between gap-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-5 w-16" />
                </div>
                <div className="mt-5 space-y-5">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="size-8 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-5 w-52" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <BottomBarSkeleton />
        </div>
        <aside aria-hidden className="hidden md:block">
          <Skeleton className="h-80 rounded-3xl" />
        </aside>
      </div>
    </div>
  );
}
