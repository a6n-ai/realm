import { PageShell, PageHeader, SectionCard, SkeletonTable } from "@/components/ds";
import { UsersIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Users" />
      <SectionCard title="All users">
        <SkeletonTable columns={3} rows={10} />
      </SectionCard>
    </PageShell>
  );
}
