import { TruckIcon } from "lucide-react";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { zonedDateIso } from "@foundry/commons";
import { previewPush } from "@/lib/services/optimoroute/push";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { DayHeader } from "../day-header";
import { DispatchTabs } from "../dispatch-tabs";
import { PushControl } from "../push-control";
import { RemoveControl } from "../remove-control";

type SearchParams = Promise<{ date?: string }>;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function StalePage({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const { date: dateParam } = await searchParams;
  const { timezone } = await getAppSettings();
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const date = dateParam && ISO_DATE.test(dateParam) ? dateParam : today;

  let preview;
  try {
    preview = await previewPush(date);
  } catch (e) {
    return (
      <PageShell>
        <PageHeader icon={TruckIcon} title="Dispatch" subtitle="Today's routes and driver assignments." />
        <DayHeader date={date} today={today} basePath="/dashboard/dispatch/stale" />
        <DispatchTabs date={date} />
        <SectionCard title="OptimoRoute unreachable">
          <p className="text-sm">{e instanceof Error ? e.message : "Unknown error"}</p>
        </SectionCard>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader icon={TruckIcon} title="Dispatch" subtitle="Today's routes and driver assignments." />
      <DayHeader date={date} today={today} basePath="/dashboard/dispatch/stale" />
      <DispatchTabs date={date} />
      <SectionCard title="Send to OptimoRoute" variant="flat">
        <PushControl date={date} stops={preview.create.length + preview.update.length} />
      </SectionCard>
      {preview.remove.length > 0 ? (
        <SectionCard title="On OptimoRoute but not scheduled">
          <p className="text-muted-foreground mb-3 text-sm">
            Still on a route but no longer scheduled here — paused, skipped, or cancelled since the
            last push. Until removed, a driver arrives at the door.
          </p>
          <RemoveControl date={date} stale={preview.remove} scheduledCount={preview.create.length + preview.update.length} />
        </SectionCard>
      ) : (
        <SectionCard title="On OptimoRoute but not scheduled">
          <p className="text-muted-foreground text-sm">Nothing stale for this date.</p>
        </SectionCard>
      )}
    </PageShell>
  );
}
