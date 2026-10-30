import { Skeleton } from "@/components/customer/kit";
import { cn } from "@/components/customer/kit/cn";

// Inside a card the plain skeleton fill matches the card in dark mode; a wash of the text colour always shows.
const ON_CARD = "bg-[color-mix(in_oklch,var(--foreground)_12%,transparent)]!";
const Bone = ({ className }: { className?: string }) => <Skeleton className={cn(ON_CARD, className)} />;

/** Mirrors DeliveriesView: greeting, plan chips, plan card, then the week card (left) beside the day's trip (right),
 *  and the phone's floating action bar, which ends short of the shell's floating menu button. */
export function DeliveriesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading deliveries" role="status" className="pb-20 lg:pb-8">
      <header className="mb-4 lg:mb-6">
        <Skeleton className="h-9 w-32 lg:h-11" />
        <div className="mt-3 flex gap-2 overflow-hidden py-1">
          <Skeleton className="h-10 w-40 shrink-0 rounded-full" />
          <Skeleton className="h-10 w-32 shrink-0 rounded-full" />
          <Skeleton className="h-10 w-32 shrink-0 rounded-full" />
        </div>
        <div className="c-surface mt-3 rounded-3xl border-l-4 border-[var(--border)] bg-[var(--card,#fff)] px-5 py-4">
          <Bone className="h-7 w-56 max-w-full" />
          <Bone className="mt-2 h-5 w-64 max-w-full" />
          <Bone className="mt-1.5 h-4 w-48" />
          <div className="mt-4 flex lg:justify-end">
            <Bone className="h-11 flex-1 rounded-full lg:w-44 lg:flex-none" />
          </div>
        </div>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-9 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div>
          <div className="c-surface rounded-3xl bg-[var(--card,#fff)] px-3 pb-3 pt-3 sm:px-4">
            <div className="flex items-center justify-between gap-3 pl-1">
              <Bone className="h-4 w-32 rounded-full" />
              <div className="flex">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="grid size-11 place-items-center"><Bone className="size-5 rounded-full" /></div>
                ))}
              </div>
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="flex flex-col items-center gap-2 py-2">
                  <Bone className="h-3 w-7 rounded-full" />
                  <Bone className="h-5 w-4 rounded-md" />
                  <Bone className="size-1.5 rounded-full" />
                  <Bone className="size-4 rounded-sm" />
                </div>
              ))}
            </div>
          </div>
          <Skeleton className="mt-3 h-5 w-64 max-w-full" />
        </div>
        <div className="min-w-0 space-y-8">
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 rounded-full" />
            <Skeleton className="h-10 w-52 lg:h-[42px]" />
            <Skeleton className="h-5 w-44" />
          </div>
          {/* Trip progress: three steps on a line. */}
          <div className="relative flex justify-between px-6">
            <div aria-hidden className="absolute inset-x-10 top-4 h-0.5 bg-[var(--border)]" />
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="relative flex flex-col items-center gap-2">
                <Skeleton className="size-8 rounded-full" />
                <Skeleton className="h-3 w-16 rounded-full" />
              </div>
            ))}
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-20 rounded-full" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
            </div>
          </div>
          <div>
            <Skeleton className="mb-3 h-3 w-24 rounded-full" />
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-5 w-3/4 max-w-xs" />
            </div>
          </div>
          <div className="hidden gap-2 lg:flex">
            <Skeleton className="h-[50px] flex-1 rounded-full" />
            <Skeleton className="h-[50px] w-24 rounded-full" />
            <Skeleton className="h-[50px] w-24 rounded-full" />
          </div>
        </div>
      </div>
      <div aria-hidden className="fixed left-3 right-[calc(1.25rem+58px)] bottom-[calc(var(--tabbar-h,4rem)+max(0.75rem,env(safe-area-inset-bottom))+0.5rem)] z-30 flex h-[58px] items-center gap-2 lg:hidden">
        <Bone className="h-[50px] flex-[1.6] rounded-full" />
        <Bone className="h-[50px] flex-1 rounded-full" />
        <Bone className="h-[50px] flex-1 rounded-full" />
      </div>
    </div>
  );
}
