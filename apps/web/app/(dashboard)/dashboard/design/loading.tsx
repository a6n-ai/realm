import { PaletteIcon } from "lucide-react";
import { PageHeader, PageShell, SkeletonCardGrid } from "@/components/ds";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader
        icon={PaletteIcon}
        title="Design system"
        subtitle="Shared components used across the dashboard"
      />
      <div className="space-y-8">
        <SkeletonCardGrid count={6} className="sm:grid-cols-2 lg:grid-cols-3" />
        <SkeletonCardGrid count={3} className="sm:grid-cols-3" />
      </div>
    </PageShell>
  );
}
