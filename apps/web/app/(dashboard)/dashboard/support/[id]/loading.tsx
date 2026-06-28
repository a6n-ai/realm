import { PageShell, SectionCard, SkeletonPageHeader, SkeletonListRows } from "@/components/ds";

export default function Loading() {
  return (
    <PageShell>
      <SkeletonPageHeader />
      <SectionCard title="Conversation">
        <SkeletonListRows rows={4} />
      </SectionCard>
    </PageShell>
  );
}
