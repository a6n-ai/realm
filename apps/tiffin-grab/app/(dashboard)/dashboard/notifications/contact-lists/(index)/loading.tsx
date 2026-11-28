import { SectionCard } from "@/components/ds";
import { ContactListsTableSkeleton } from "../contact-lists-table";
import { SectionDateRange } from "@/components/filters/section-date-range";

export default function Loading() {
  return (
    <div className="space-y-6">
      <SectionDateRange />
      <SectionCard title="Contact lists" subtitle="Uploaded audiences, with how consent was obtained.">
        <ContactListsTableSkeleton />
      </SectionCard>
    </div>
  );
}
