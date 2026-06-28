import { PageHeader, SkeletonCardGrid } from "@/components/ds";
import { SettingsIcon } from "lucide-react";

// Loading for the settings INDEX route — mirrors its card grid. Flat sub-pages
// (general, lead-sources, …) and the wallet/discounts layouts ship their own
// loading.tsx so they override this rather than inheriting the grid.
export default function Loading() {
  return (
    <>
      <PageHeader icon={SettingsIcon} title="Settings" subtitle="Configure how the platform runs." />
      <SkeletonCardGrid count={6} className="sm:grid-cols-2 lg:grid-cols-3" />
    </>
  );
}
