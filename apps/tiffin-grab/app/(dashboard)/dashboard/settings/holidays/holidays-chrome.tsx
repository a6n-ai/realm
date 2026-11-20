import type { ReactNode } from "react";
import { CalendarOffIcon } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/ds";

// Everything on the Holidays page that needs no data. The page fills the slots with real
// data; loading.tsx fills them with skeletons, so both paint the same frame.
export function HolidaysChrome({ actions, needsPlacing, list }: { actions: ReactNode; needsPlacing?: ReactNode; list: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader icon={CalendarOffIcon} title="Holidays" subtitle="Days the kitchen is closed." actions={actions} />
      {needsPlacing}
      <SectionCard title="Holidays">{list}</SectionCard>
    </div>
  );
}
