import { PaletteIcon } from "lucide-react";
import { PageHeader, PageShell, SkeletonCardGrid } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader icon={PaletteIcon} title="Design system" subtitle="Shared components used across the dashboard" />
        <SkeletonCardGrid count={3} />
      </PageShell>
    </div>
  );
}
