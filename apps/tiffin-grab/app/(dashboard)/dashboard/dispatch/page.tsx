import { Suspense } from "react";
import { TruckIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { buildDayLedger } from "@/lib/services/optimoroute/ledger";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { DayHeader } from "./day-header";
import { DispatchTabs } from "./dispatch-tabs";
import { LedgerTable } from "./ledger-table";
import { DayActions } from "./day-actions";

type SearchParams = Promise<{ date?: string }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DispatchPage({ searchParams }: { searchParams: SearchParams }) {
  const { date: dateParam } = await searchParams;
  const dateKey = dateParam && ISO_DATE.test(dateParam) ? dateParam : "today";

  return (
    <PageShell>
      <PageHeader
        icon={TruckIcon}
        title="Dispatch"
        subtitle="Today's routes and driver assignments."
      />
      <Suspense key={dateKey} fallback={<DispatchData.Skeleton />}>
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

  let ledger;
  try {
    ledger = await buildDayLedger(date);
  } catch (e) {
    return (
      <>
        <DayHeader date={date} today={today} basePath="/dashboard/dispatch" />
        <DispatchTabs date={date} />
        <SectionCard title="OptimoRoute unreachable">
          <p className="text-sm">{e instanceof Error ? e.message : "Unknown error"}</p>
        </SectionCard>
      </>
    );
  }

  const unassigned = ledger.rows
    .filter((r) => r.onLabels && r.deliveryPublicId && (r.action === "send" || (r.group === "needs_action" && !r.driver)))
    .map((r) => r.deliveryPublicId!);
  // Off-label rows (e.g. held after a failed delivery) are in the ledger counts but not in Labels,
  // so the three terms that sum to Labels are counted from on-label rows only.
  const onLabels = ledger.rows.filter((r) => r.onLabels);
  const n = (g: string) => onLabels.filter((r) => r.group === g).length;
  // Scheduled rows merged into another trip are on the labels but grouped not_today.
  const merged = n("not_today");
  // Stops, not tiffins: a Friday trip carrying Sat/Sun is one stop with several labels.
  const tiffins = onLabels.filter((r) => r.group !== "not_today").reduce((t, r) => t + (r.tiffinUnits ?? 0), 0);
  const c = ledger.counts;

  return (
    <>
      <DayHeader date={date} today={today} basePath="/dashboard/dispatch" />
      <DispatchTabs date={date} />

      <p className="text-sm" aria-live="polite">
        <span className="font-semibold">Labels {ledger.labelsCount}</span>
        <span className="text-muted-foreground"> ({tiffins} tiffins)</span>
        {" = "}On route {n("on_route")} · Done {n("done")} · Needs action {n("needs_action")}{merged > 0 ? ` · Merged elsewhere ${merged}` : ""}
        <span className="text-muted-foreground"> — Not going today {c.not_today - merged} · Not ours on OptimoRoute {c.not_ours}</span>
      </p>

      <SectionCard title="Send to OptimoRoute" variant="flat">
        <DayActions date={date} labelsCount={ledger.labelsCount} unassigned={unassigned} />
      </SectionCard>

      <SectionCard title="Day">
        <LedgerTable date={date} ledger={ledger} />
      </SectionCard>
    </>
  );
}

DispatchData.Skeleton = function DispatchDataSkeleton() {
  return (
    <>
      <SectionCard title="Day" variant="flat">
        <Skeleton className="h-9 w-64" />
      </SectionCard>
      <Skeleton className="h-5 w-96" />
      <SectionCard title="Send to OptimoRoute" variant="flat">
        <Skeleton className="h-16 w-full" />
      </SectionCard>
      <SectionCard title="Day">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
    </>
  );
};
