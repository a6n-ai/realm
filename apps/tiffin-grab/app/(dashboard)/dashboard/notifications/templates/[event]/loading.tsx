import { BackButton } from "@foundry/design-system";
import { TemplateEditorSkeleton } from "@relay/engine/ui/template-editor";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="space-y-6">
      <BackButton href="/dashboard/notifications/templates" label="All templates" />
      <div className="space-y-1">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <SectionCard title="Template content">
        <TemplateEditorSkeleton />
      </SectionCard>
    </div>
  );
}
