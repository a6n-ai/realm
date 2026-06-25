import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader } from "@/components/ds";
import { LayoutDashboardIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={LayoutDashboardIcon} title="Loading…" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </PageShell>
  );
}
