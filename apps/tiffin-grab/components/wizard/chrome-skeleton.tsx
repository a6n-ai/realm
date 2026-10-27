import { Skeleton } from "@/components/customer/kit";

/**
 * SubscribeChrome's shape: full-bleed 64px bar, logo + Back (sm up) left, step tag centered, Close right.
 * `chip` adds the running-total pill (count badge + total) that renew and checkout show beside Close.
 */
export function ChromeSkeleton({ chip = false }: { chip?: boolean }) {
  return (
    <div className="mb-6 mr-[calc(50%-50vw)] ml-[calc(50%-50vw)] border-b border-[var(--border)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Skeleton className="h-9 w-36 rounded-full" />
          <Skeleton className="hidden h-11 w-20 rounded-full sm:block" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full max-sm:invisible" />
        <div className="flex items-center justify-end gap-2">
          {chip && <Skeleton className="h-11 w-24 rounded-full" />}
          <Skeleton className="size-11 rounded-full" />
        </div>
      </div>
    </div>
  );
}
