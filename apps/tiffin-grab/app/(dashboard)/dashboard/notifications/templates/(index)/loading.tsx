import { SectionCard } from "@/components/ds";
import { TemplateListSkeleton } from "../template-list-skeleton";

export default function Loading() {
  return (
    <SectionCard title="Templates" subtitle="A channel with no template does not send. Select an event to edit.">
      <TemplateListSkeleton />
    </SectionCard>
  );
}
