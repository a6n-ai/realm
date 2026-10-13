import { Suspense } from "react";
import { CalendarOffIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { listDeclarableOrganizations, listHolidays, listNeedsPlacing } from "@/lib/services/holidays.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { HolidayDialog } from "./holiday-dialog";
import { HolidaysTable, HolidaysTableSkeleton, NeedsPlacingTable } from "./holidays-table";

export default async function HolidaysPage() {
  await requirePermission({ holiday: ["read"] });
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const [{ timezone }, rows, waiting, organizations] = await Promise.all([
    getAppSettings(), listHolidays(visible), listNeedsPlacing(visible), listDeclarableOrganizations(visible),
  ]);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const waitingBy = new Map<string, number>();
  for (const w of waiting) waitingBy.set(w.holidayPublicId, (waitingBy.get(w.holidayPublicId) ?? 0) + 1);

  return (
    <PageShell>
      <PageHeader
        icon={CalendarOffIcon}
        title="Holidays"
        subtitle="Days the kitchen is closed."
        actions={<HolidayDialog today={today} organizations={organizations} />}
      />
      {waiting.length > 0 && (
        <SectionCard title="Needs placing">
          <p className="text-muted-foreground mb-3 text-sm">
            These closed days have no extra day yet. Pick the first day and the tiffins go on that plan&apos;s next free delivery days.
          </p>
          <NeedsPlacingTable rows={waiting} today={today} />
        </SectionCard>
      )}
      <SectionCard title="Holidays">
        <Suspense fallback={<HolidaysTableSkeleton />}>
          <HolidaysTable rows={rows.map((r) => ({ ...r, needsPlacing: waitingBy.get(r.publicId) ?? 0 }))} today={today} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}
