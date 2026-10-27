import { Skeleton } from "@/components/customer/kit";

/** BottomBar's shape: on phones a fixed glass bar (c-float-bar) with a Back capsule + primary capsule; from sm up inline and right-aligned. */
export function BottomBarSkeleton() {
  return (
    <div className="c-glass c-float-bar fixed inset-x-0 bottom-0 z-[45] border-t border-transparent px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:static sm:mt-8 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:backdrop-blur-none">
      <div className="mx-auto flex max-w-3xl gap-2 sm:justify-end">
        <Skeleton className="h-[50px] w-28 shrink-0 rounded-full sm:hidden" />
        <Skeleton className="h-[50px] flex-1 rounded-full sm:w-60 sm:flex-none" />
      </div>
    </div>
  );
}
