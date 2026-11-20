import { CustomerLogsTableSkeleton } from "@/app/(dashboard)/dashboard/settings/logs/customers/customer-logs-table";
import { ActivityCard } from "../log-cards";

export default function Loading() {
  return (
    <ActivityCard>
      <CustomerLogsTableSkeleton />
    </ActivityCard>
  );
}
