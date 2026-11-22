import { CalendarIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuWeekRowsSkeleton } from "../menu-history-card";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <PageHeader
          icon={CalendarIcon}
          title="Weekly Menus"
          subtitle="Monday-to-Sunday kitchen boards. Start a week, then fill and release it."
        />
        <SectionCard title="Weeks" subtitle="Open a week to fill it, release it, or change a live menu.">
          <MenuWeekRowsSkeleton />
        </SectionCard>
      </PageShell>
    </div>
  );
}
