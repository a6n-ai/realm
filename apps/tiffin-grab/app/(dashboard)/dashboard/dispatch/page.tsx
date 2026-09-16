import { Suspense } from "react";
import { TruckIcon, ChevronDownIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Skeleton } from "@foundry/ui/skeleton";
import { Badge } from "@foundry/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { previewPush } from "@/lib/services/optimoroute/push";
import { buildDispatchRows, listKnownDrivers } from "@/lib/services/optimoroute/drivers";
import { PageShell, PageHeader, SectionCard, Card } from "@/components/ds";
import { DayHeader } from "./day-header";
import { DispatchTabs } from "./dispatch-tabs";
import { DispatchView } from "./dispatch-view";
import { PlannedOrders } from "./routes-view";
import { PushControl } from "./push-control";

type SearchParams = Promise<{ date?: string }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function DispatchPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={TruckIcon}
        title="Dispatch"
        subtitle="Today's routes and driver assignments."
      />
      <Suspense fallback={<DispatchData.Skeleton />}>
        <DispatchData searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function DispatchData({ searchParams }: { searchParams: SearchParams }) {
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
        <DayHeader date={date} today={today} basePath="/dashboard/dispatch" />
        <SectionCard title="OptimoRoute unreachable">
          <p className="text-sm">{e instanceof Error ? e.message : "Unknown error"}</p>
        </SectionCard>
      </>
    );
  }

  let dispatchRows, drivers;
  try {
    [dispatchRows, drivers] = await Promise.all([buildDispatchRows(date), listKnownDrivers()]);
  } catch (e) {
    return (
      <>
        <DayHeader date={date} today={today} basePath="/dashboard/dispatch" />
        <SectionCard title="Dispatch data unavailable">
          <p className="text-sm">{e instanceof Error ? e.message : "Unknown error"}</p>
        </SectionCard>
      </>
    );
  }

  const scheduledCount = preview.create.length + preview.update.length;

  return (
    <>
      <DayHeader date={date} today={today} basePath="/dashboard/dispatch" />

      <DispatchTabs date={date} />

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{preview.create.length} to create</Badge>
        <Badge variant="secondary">{preview.update.length} to update</Badge>
        <Badge variant="outline">{preview.remove.length} stale</Badge>
        <Badge variant="outline">{scheduledCount} stop{scheduledCount === 1 ? "" : "s"}</Badge>
      </div>

      {/* Primary content: this is the task a dispatcher opens the page to do. */}
      <SectionCard title="Dispatch">
        <DispatchView date={date} rows={dispatchRows} drivers={drivers} />
      </SectionCard>

      {/*
        Secondary: sending/pulling is a less frequent action than reassigning a stop.
        variant="flat" (same demotion the account sub-sections use) keeps Dispatch above
        as the page's one "glow" card instead of every SectionCard competing equally.
      */}
      <SectionCard title="Send to OptimoRoute" variant="flat">
        <PushControl date={date} stops={scheduledCount} />
      </SectionCard>

      {/*
        Reference detail, not the primary task — collapsed by default.
        SectionCard's `title` is string-only (see @foundry/design-system/src/section-card.tsx),
        so the clickable header is built here directly instead of through SectionCard, matching
        its header/title classes so the collapsed card still reads as one of the page's cards.
      */}
      <Collapsible className="group/collapsible">
        <Card variant="flat" className="p-5">
          {/* hover:bg-muted matches the app's other full-width clickable rows (menu-grid, account nav) so the disclosure reads as interactive, not just a static heading */}
          <CollapsibleTrigger className="-mx-2 -my-1 mb-2 flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-muted md:mb-3">
            <h2 className="text-base font-semibold tracking-tight text-balance md:text-lg">
              Stop details
            </h2>
            <ChevronDownIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">New stops ({preview.create.length})</p>
              <PlannedOrders rows={preview.create} />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Already on the route ({preview.update.length})</p>
              <PlannedOrders rows={preview.update} />
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </>
  );
}

DispatchData.Skeleton = function DispatchDataSkeleton() {
  return (
    <>
      <SectionCard title="Day" variant="flat">
        <Skeleton className="h-9 w-64" />
      </SectionCard>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-24 rounded-full" />
        ))}
      </div>
      <SectionCard title="Dispatch">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
      <SectionCard title="Send to OptimoRoute" variant="flat">
        <Skeleton className="h-16 w-full" />
      </SectionCard>
    </>
  );
};
