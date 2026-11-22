import { UploadIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader
          icon={UploadIcon}
          title="Import inquiries"
          subtitle="Bulk-create or update inquiries from an Excel sheet."
        />
        <SectionCard title="Upload">
          <Skeleton className="h-40 w-full" />
        </SectionCard>
      </PageShell>
    </div>
  );
}
