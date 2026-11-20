import { SectionCard } from "@/components/ds";
import { RolesTableSkeleton } from "./roles-table";

export default function Loading() {
  return (
    <SectionCard title="Roles">
      <RolesTableSkeleton />
    </SectionCard>
  );
}
