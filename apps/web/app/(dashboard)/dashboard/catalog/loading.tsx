import { PageShell, PageHeader, SkeletonCardGrid } from "@/components/ds";
import { UtensilsCrossedIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="Catalog" />
      <SkeletonCardGrid count={6} />
    </PageShell>
  );
}
