import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { TicketsChrome } from "../tickets-chrome";
import { TicketsListSkeleton } from "../tickets-list";

export default function Loading() {
  return <TicketsChrome stats={<StatCardsSkeleton count={5} />} list={<TicketsListSkeleton />} />;
}
