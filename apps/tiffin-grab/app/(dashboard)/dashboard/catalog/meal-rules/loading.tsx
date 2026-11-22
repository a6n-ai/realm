import { ListChecksIcon } from "lucide-react";
import { PageHeader, PageShell, SkeletonCardGrid } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader
          icon={ListChecksIcon}
          title="Meal Rules"
          subtitle="Additional limits that apply to the final meal, beyond meal size composition and swap limits."
        />
        <SkeletonCardGrid count={4} className="grid-cols-1" />
      </PageShell>
    </div>
  );
}
