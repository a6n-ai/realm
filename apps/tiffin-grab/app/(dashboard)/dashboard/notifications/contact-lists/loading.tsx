import { SectionCard } from "@/components/ds";
import { ContactListsTableSkeleton } from "./contact-lists-table";

export default function Loading() {
  return (
    <SectionCard title="Contact lists" subtitle="Uploaded audiences, with how consent was obtained.">
      <ContactListsTableSkeleton />
    </SectionCard>
  );
}
