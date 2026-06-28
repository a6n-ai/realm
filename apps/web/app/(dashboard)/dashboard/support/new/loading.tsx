import { PageShell, PageHeader, SectionCard, SkeletonFormCard } from "@/components/ds";
import { LifeBuoyIcon } from "lucide-react";

export default function Loading() {
  return (
    <PageShell>
      <PageHeader icon={LifeBuoyIcon} title="New ticket" subtitle="Tell us what's going on and we'll take a look." />
      <SectionCard title="Ticket details">
        <SkeletonFormCard fields={4} title={false} />
      </SectionCard>
    </PageShell>
  );
}
