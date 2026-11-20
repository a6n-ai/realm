import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { PaymentsFrame } from "../payments-frame";
import { LogsTableSkeleton } from "./logs-table";

export default function Loading() {
  return (
    <>
      <PaymentsFrame stats={<StatCardsSkeleton count={5} />} />
      <SectionCard title="Provider logs">
        <LogsTableSkeleton />
      </SectionCard>
    </>
  );
}
