import { PageShell, SkeletonCardGrid, SkeletonPageHeader } from "@/components/ds";
import { catalogIndexEntries } from "@/lib/catalog/resource-config";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <SkeletonPageHeader />
        {/* +2: the bespoke Swap Rules and Meal Rules cards. */}
        <SkeletonCardGrid count={catalogIndexEntries().length + 2} className="sm:grid-cols-2 lg:grid-cols-3" />
      </PageShell>
    </div>
  );
}
