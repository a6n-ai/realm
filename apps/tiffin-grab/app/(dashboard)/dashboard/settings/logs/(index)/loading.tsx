import { SectionCard } from "@/components/ds";
import { LogsTableSkeleton } from "../logs-table";

export default function Loading() {
  return (
    <SectionCard title="Activity">
      <LogsTableSkeleton />
    </SectionCard>
  );
}
