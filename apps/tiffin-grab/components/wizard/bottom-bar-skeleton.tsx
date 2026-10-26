import { Skeleton } from "@/components/customer/kit";

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
