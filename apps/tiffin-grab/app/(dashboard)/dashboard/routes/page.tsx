import { Suspense } from "react";
import { MapPinnedIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { previewPush } from "@/lib/services/optimoroute/push";
import { PageShell, PageHeader, SectionCard, SkeletonStatCards, StatGrid } from "@/components/ds";
import { LabelDatePicker } from "../labels/label-date-picker";
import { PlannedOrders } from "./routes-view";
import { PushControl } from "./push-control";
import { RemoveControl } from "./remove-control";

type SearchParams = Promise<{ date?: string }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function RoutesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={MapPinnedIcon}
        title="Routes"
        subtitle="What a push to OptimoRoute would change for one delivery day."
      />
      <Suspense fallback={<RoutesData.Skeleton />}>
        <RoutesData searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function RoutesData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const { date: dateParam } = await searchParams;
  const [{ timezone }, status] = await Promise.all([getAppSettings(), getOptimoRouteStatus()]);

  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const date = dateParam && ISO_DATE.test(dateParam) ? dateParam : today;

  if (!status.hasApiKey) {
    return (
      <SectionCard title="Not configured">
        <p className="text-muted-foreground text-sm">
          Set <code>OPTIMOROUTE_API_KEY</code> in the server environment to enable route sync.
          The key is read server-side only — it is never stored in the database and never
          reaches the browser.
        </p>
      </SectionCard>
    );
  }

  let preview;
  try {
    preview = await previewPush(date);
  } catch (e) {
    return (
      <>
        <SectionCard title="Day">
          <LabelDatePicker date={date} today={today} basePath="/dashboard/routes" />
        </SectionCard>
        <SectionCard title="OptimoRoute unreachable">
          <p className="text-sm">{e instanceof Error ? e.message : "Unknown error"}</p>
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <SectionCard title="Day">
        <LabelDatePicker date={date} today={today} basePath="/dashboard/routes" />
      </SectionCard>

      <StatGrid
        cols={4}
        items={[
          { label: "To create", value: preview.create.length },
          { label: "To update", value: preview.update.length },
          { label: "Stale", value: preview.remove.length, hint: "no longer scheduled" },
          { label: "Stops", value: preview.create.length + preview.update.length },
        ]}
      />

      <SectionCard title="Send to OptimoRoute">
        <PushControl date={date} stops={preview.create.length + preview.update.length} />
      </SectionCard>

      {preview.remove.length > 0 ? (
        <SectionCard title="On OptimoRoute but not scheduled">
          <p className="text-muted-foreground mb-3 text-sm">
            Still on a route but no longer scheduled here — paused, skipped, or cancelled
            since the last push. Until removed, a driver arrives at the door.
          </p>
          <RemoveControl
            date={date}
            stale={preview.remove}
            scheduledCount={preview.create.length + preview.update.length}
          />
        </SectionCard>
      ) : null}

      <SectionCard title={`New stops (${preview.create.length})`}>
        <PlannedOrders rows={preview.create} />
      </SectionCard>

      <SectionCard title={`Already on the route (${preview.update.length})`}>
        <PlannedOrders rows={preview.update} />
      </SectionCard>
    </>
  );
}

RoutesData.Skeleton = function RoutesDataSkeleton() {
  return (
    <>
      <SectionCard title="Day">
        <Skeleton className="h-9 w-64" />
      </SectionCard>
      <SkeletonStatCards count={4} />
      <SectionCard title="New stops">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
      <SectionCard title="Already on the route">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
    </>
  );
};
