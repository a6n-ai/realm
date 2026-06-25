import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { UsersIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Loading…" />
      <SectionCard title=" ">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </SectionCard>
    </PageShell>
  );
}
