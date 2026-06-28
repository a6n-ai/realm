import { PageHeader, SectionCard, SkeletonTable } from "@/components/ds";
import { Webhook } from "lucide-react";

export default function Loading() {
  return (
    <>
      <PageHeader icon={Webhook} title="Lead sources" />
      <SectionCard title="Sources">
        <SkeletonTable columns={4} />
      </SectionCard>
    </>
  );
}
