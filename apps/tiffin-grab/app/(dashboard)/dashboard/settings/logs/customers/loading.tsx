import { SectionCard } from "@/components/ds";
import { CustomerLogsTableSkeleton } from "./customer-logs-table";

export default function Loading() {
  return (
    <SectionCard title="Customer activity" subtitle="Address changes, meal picks, holds, reschedules, and other saved customer actions.">
      <CustomerLogsTableSkeleton />
    </SectionCard>
  );
}
