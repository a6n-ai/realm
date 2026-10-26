import { Skeleton } from "@/components/customer/kit";

/** SubscribeChrome's shape: full-bleed 64px bar, logo left, step tag centered, Close right. */
export function ChromeSkeleton() {
  return (
    <div className="mb-6 mr-[calc(50%-50vw)] ml-[calc(50%-50vw)] border-b border-[var(--border)] pt-[env(safe-area-inset-top)]">
      <div className="mx-auto grid h-16 max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 lg:px-6">
        <Skeleton className="h-9 w-36 rounded-full" />
        <Skeleton className="h-4 w-16 rounded-full max-sm:invisible" />
        <Skeleton className="size-11 justify-self-end rounded-full" />
      </div>
    </div>
  );
}
