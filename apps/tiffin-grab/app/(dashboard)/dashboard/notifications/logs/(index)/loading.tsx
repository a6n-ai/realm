import { SendsCard } from "../log-cards";
import { LogsTableSkeleton } from "../logs-table";

export default function Loading() {
  return (
    <SendsCard>
      <LogsTableSkeleton />
    </SendsCard>
  );
}
