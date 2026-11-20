import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { ClientsListSkeleton } from "./clients-list";

export default function Loading() {
  return (
    <>
      <StatCardsSkeleton count={5} />
      <SectionCard title="Clients" subtitle="Your brand and its franchises. Open one to edit its details, address and members.">
        <ClientsListSkeleton />
      </SectionCard>
    </>
  );
}
