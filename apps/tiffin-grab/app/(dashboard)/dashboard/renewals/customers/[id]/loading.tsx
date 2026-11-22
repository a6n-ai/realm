import { PageShell, SkeletonPageHeader } from "@/components/ds";
import { RenewalSectionsSkeleton } from "./renewal-sections-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <SkeletonPageHeader action subtitle />
        <RenewalSectionsSkeleton />
      </PageShell>
    </div>
  );
}
