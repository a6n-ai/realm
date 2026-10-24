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

/** Progress's shape: one 4px segment plus label per step. */
export function ProgressSkeleton({ steps = 3 }: { steps?: number }) {
  return (
    <div className="mb-6 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps}, minmax(0, 1fr))` }}>
      {Array.from({ length: steps }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-1 rounded-full" />
          <Skeleton className="h-3 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** BottomBar's shape: fixed glass bar with Back + primary on mobile, inline right-aligned from sm up. */
export function BottomBarSkeleton() {
  return (
    <div className="c-glass fixed inset-x-0 bottom-0 z-[45] border-t border-[var(--border)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
      <div className="mx-auto flex max-w-3xl gap-2 sm:justify-end">
        <Skeleton className="h-[50px] w-24 shrink-0 rounded-[14px] sm:hidden" />
        <Skeleton className="h-[50px] flex-1 rounded-[14px] sm:h-10 sm:w-44 sm:flex-none" />
      </div>
    </div>
  );
}
