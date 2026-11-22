import { Skeleton } from "@foundry/ui/skeleton";
import { HolidaysChrome } from "../holidays-chrome";
import { HolidaysTableSkeleton } from "../holidays-table";

export default function Loading() {
  return <HolidaysChrome actions={<Skeleton className="h-9 w-36" />} list={<HolidaysTableSkeleton />} />;
}
