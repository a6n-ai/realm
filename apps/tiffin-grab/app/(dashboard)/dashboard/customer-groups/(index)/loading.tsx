import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { CustomerGroupsChrome } from "../groups-chrome";
import { GroupsTableSkeleton } from "../groups-table";
import { NewGroupButtonSkeleton } from "../new-group-button-skeleton";

export default function Loading() {
  return <CustomerGroupsChrome actions={<NewGroupButtonSkeleton />} stats={<StatCardsSkeleton count={5} />} list={<GroupsTableSkeleton />} />;
}
