import { TruckIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { zonedDateIso } from "@foundry/commons";
import { buildDispatchRows, listKnownDrivers } from "@/lib/services/optimoroute/drivers";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { DayHeader } from "../day-header";
import { DispatchTabs } from "../dispatch-tabs";
import { DriverRoster } from "../driver-roster";

type SearchParams = Promise<{ date?: string }>;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DriversPage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const { date: dateParam } = await searchParams;
  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const date = dateParam && ISO_DATE.test(dateParam) ? dateParam : today;

  let dispatchRows, drivers;
  try {
    [dispatchRows, drivers] = await Promise.all([buildDispatchRows(date), listKnownDrivers()]);
  } catch (e) {
    return (
      <PageShell>
        <PageHeader icon={TruckIcon} title="Dispatch" subtitle="Today's routes and driver assignments." />
        <DayHeader date={date} today={today} />
        <DispatchTabs date={date} />
        <SectionCard title="Dispatch data unavailable">
          <p className="text-sm">{e instanceof Error ? e.message : "Unknown error"}</p>
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader icon={TruckIcon} title="Dispatch" subtitle="Today's routes and driver assignments." />
      <DayHeader date={date} today={today} />
      <DispatchTabs date={date} />
      <DriverRoster drivers={drivers} rows={dispatchRows} />
    </PageShell>
  );
}
