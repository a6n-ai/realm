import { MegaphoneIcon } from "lucide-react";
import { Skeleton } from "@foundry/ui/skeleton";
import { PageHeader, SectionCard, SkeletonTable } from "@/components/ds";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <PageHeader
        icon={MegaphoneIcon}
        title="Promotions"
        subtitle="Hero sticker, popup and offers carousel on the home page."
        actions={<Skeleton className="h-8 w-36" />}
      />
      <SectionCard title="All promotions">
        <SkeletonTable columns={5} rows={5} />
      </SectionCard>
    </div>
  );
}
