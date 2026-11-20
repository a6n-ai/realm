import { parseIsoDate } from "@/lib/dates/iso-date";
import { Suspense } from "react";
import { CircleAlertIcon, CircleCheckIcon, EraserIcon, RouteIcon, TagIcon } from "lucide-react";
import { StatCards } from "@/components/dashboard/stat-cards";
import { zonedDateIso } from "@foundry/commons";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/settings";
import { getOptimoRouteStatus } from "@/lib/optimoroute/config";
import { buildDayLedger } from "@/lib/optimoroute/ledger";
import { HolidayBanner } from "@/components/dashboard/holiday-banner";
import { getSession } from "@/lib/auth/session";
import { holidaysOn } from "@/lib/deliveries/holidays.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { SectionCard } from "@/components/ds";
import { DispatchChrome, DispatchSkeleton } from "./dispatch-chrome";
import { DayHeader } from "./day-header";
import { LedgerTable } from "./ledger-table";
import { DayActions } from "./day-actions";
import { DispatchExportButton } from "./dispatch-export-button";
import { buildDispatchRows } from "@/lib/optimoroute/drivers";
import { requestNow } from "@/lib/dates/request-now";

type SearchParams = Promise<{ date?: string }>;

export default async function DispatchPage({ searchParams }: { searchParams: SearchParams }) {
  const { date: dateParam } = await searchParams;
  const dateKey = parseIsoDate(dateParam) ?? "today";

  return (
    <DispatchChrome>
      <Suspense key={dateKey} fallback={<DispatchSkeleton />}>
        <DispatchData searchParams={searchParams} />
      </Suspense>
    </DispatchChrome>
  );
}

async function DispatchData({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission({ delivery: ["read"] });
  const { date: dateParam } = await searchParams;
  const [{ timezone }, status] = await Promise.all([getAppSettings(), getOptimoRouteStatus()]);

  const today = zonedDateIso(requestNow(), timezone);
  const date = parseIsoDate(dateParam) ?? today;
  const visible = await resolveSessionVisibleOrgIds(await getSession());
  const closed = await holidaysOn(date, visible);

  if (!status.hasApiKey) {
    return (
      <>
        <HolidayBanner closed={closed} />
        <SectionCard title="Not configured">
          <p className="text-muted-foreground text-sm">
            Set <code>OPTIMOROUTE_API_KEY</code> in the server environment to enable route sync.
            The key is read server-side only — it is never stored in the database and never
            reaches the browser.
          </p>
        </SectionCard>
      </>
    );
  }

  let ledger, exportRows;
  try {
    [ledger, exportRows] = await Promise.all([buildDayLedger(date, today, visible), buildDispatchRows(date)]);
    // Phones are not rendered (or searchable) client-side without customer:read, so they never reach the browser.
    if (!(await can({ customer: ["read"] }))) {
      ledger = { ...ledger, rows: ledger.rows.map((r) => ({ ...r, phone: null })) };
      exportRows = exportRows.map((r) => ({ ...r, phone: null }));
    }
  } catch (e) {
    return (
      <>
        <HolidayBanner closed={closed} />
        <DayHeader date={date} today={today} basePath="/dashboard/dispatch" />
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
  // Scheduled rows merged into another trip are on the labels but grouped not_today (or cleanup
  // while their stop is still on OptimoRoute).
  const merged = n("not_today") + n("cleanup");
  // Stops, not tiffins: a Friday trip carrying Sat/Sun is one stop with several labels.
  const tiffins = onLabels.filter((r) => r.group !== "not_today" && r.group !== "cleanup").reduce((t, r) => t + (r.tiffinUnits ?? 0), 0);
  const c = ledger.counts;
  const view = `/dashboard/dispatch?date=${date}&view=`;

  return (
    <>
      <HolidayBanner closed={closed} />
      <DayHeader date={date} today={today} basePath="/dashboard/dispatch" actions={<DispatchExportButton dateIso={date} rows={exportRows} />} />

      <StatCards
        items={[
          { icon: TagIcon, label: "Labels", value: ledger.labelsCount, hint: `${tiffins} tiffins${merged > 0 ? ` · ${merged} merged elsewhere` : ""}` },
          { icon: RouteIcon, label: "On route", value: n("on_route"), hint: "on OptimoRoute, not done", href: `${view}on_route` },
          { icon: CircleCheckIcon, label: "Done", value: n("done"), hint: "delivered", href: `${view}done` },
          { icon: CircleAlertIcon, label: "Needs action", value: n("needs_action"), tone: n("needs_action") > 0 ? "bad" : undefined, hint: "not on a route yet", href: `${view}needs_action` },
          { icon: EraserIcon, label: "Clean up", value: c.cleanup, tone: c.cleanup > 0 ? "warn" : undefined, hint: `not going today ${c.not_today - n("not_today")} · not ours ${c.not_ours}`, href: `${view}cleanup` },
        ]}
      />

      <SectionCard title="Send to OptimoRoute">
        <DayActions date={date} labelsCount={ledger.labelsCount} unassigned={unassigned} />
      </SectionCard>

      <SectionCard title="Stops">
        <LedgerTable date={date} ledger={ledger} />
      </SectionCard>
    </>
  );
}
