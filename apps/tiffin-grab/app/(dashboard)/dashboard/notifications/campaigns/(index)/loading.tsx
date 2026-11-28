import { SectionCard } from "@/components/ds";
import { CampaignsTableSkeleton } from "../campaigns-table";
import { SectionDateRange } from "@/components/filters/section-date-range";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SectionDateRange />
      <SectionCard title="Campaigns" subtitle="Marketing sends. Every message carries an unsubscribe link and the sender's postal address.">
        <CampaignsTableSkeleton />
      </SectionCard>
    </div>
  );
}
