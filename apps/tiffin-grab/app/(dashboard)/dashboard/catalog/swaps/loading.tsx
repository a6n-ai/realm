import { ArrowLeftRightIcon } from "lucide-react";
import { PageHeader, PageShell, SkeletonCardGrid } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader
          icon={ArrowLeftRightIcon}
          title="Swap Rules"
          subtitle="Which categories customers may exchange, per plan. Whether a swap actually runs on a given order also depends on that plan having a dish in the target category. Exchange is 1 TU for 1 TU unless a rule sets an exchange override."
        />
        <SkeletonCardGrid count={4} className="grid-cols-1" />
      </PageShell>
    </div>
  );
}
