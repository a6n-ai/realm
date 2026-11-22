import { SectionCard } from "@/components/ds";
import { CampaignsTableSkeleton } from "../campaigns-table";

export default function Loading() {
  return (
    <SectionCard title="Campaigns" subtitle="Marketing sends. Every message carries an unsubscribe link and the sender's postal address.">
      <CampaignsTableSkeleton />
    </SectionCard>
  );
}
