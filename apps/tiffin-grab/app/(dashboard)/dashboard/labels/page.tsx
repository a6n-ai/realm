import { Suspense } from "react";
import { BoxIcon, CalendarDaysIcon, LayoutListIcon, PackageIcon, TagIcon, TruckIcon } from "lucide-react";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { zonedDateIso } from "@foundry/commons";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dailyLabelSheet, listDayDeliveryStatuses } from "@/lib/services/daily-labels.service";
import { getKitchenPackingSheet } from "@/lib/services/kitchen-packing-sheet.service";
import { HolidayBanner } from "@/components/dashboard/holiday-banner";
import { getSession } from "@/lib/auth/session";
import { holidaysOn } from "@/lib/services/holidays.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { LabelDatePicker } from "./label-date-picker";
import { LabelsExportButton } from "./labels-export-button";
import { LabelsPrintButton } from "./labels-print-button";
import { DeliveryStatusList } from "./delivery-status-list";
import { LabelsTable } from "./labels-table";
import { KitchenCounts, LabelList } from "./labels-view";
import { LabelsTabs } from "./labels-tabs";

type SearchParams = Promise<{ date?: string }>;

const GOING_OUT = new Set(["To be delivered", "Awaiting confirmation", "Delivered"]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function LabelsPage({ searchParams }: { searchParams: SearchParams }) {
  const { date: dateParam } = await searchParams;
  // Remount the Suspense tree when the day changes. Without this, soft-nav via the
  // date picker can leave packing-sheet <tr>s from the previous day in the client
  // Table while the Orders stat already reflects the new sheet.
  const dateKey = dateParam && ISO_DATE.test(dateParam) ? dateParam : "today";

  return (
    <PageShell>
      <PageHeader
        icon={TagIcon}
        title="Daily labels"
        subtitle="Kitchen packing sheet and container labels for one delivery day."
      />
      <Suspense key={dateKey} fallback={<LabelsData.Skeleton />}>
        <LabelsData searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function LabelsData({ searchParams }: { searchParams: SearchParams }) {
  await requireStaff();
  const { date: dateParam } = await searchParams;
  const { timezone } = await getAppSettings();

  // Default to today in the app timezone, the same clock the rest of the app runs on.
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const today = zonedDateIso(Date.now(), timezone);
  const date = dateParam && ISO_DATE.test(dateParam) ? dateParam : today;

  const [sheet, packing, deliveries, closed] = await Promise.all([
    dailyLabelSheet(date),
    getKitchenPackingSheet(date),
    listDayDeliveryStatuses(date),
    getSession().then(resolveSessionVisibleOrgIds).then((visible) => holidaysOn(date, visible)),
  ]);
  const containers = sheet.counts.reduce((n, c) => n + c.count, 0);
  const noMenu = sheet.menuWeekPublicId == null ? (
    <SectionCard title="No menu released">
      <p className="text-muted-foreground text-sm">
        No menu week is released for the week of {sheet.weekStart}, so the dishes for this day
        cannot be resolved. Release that week first — labels must show the same meal the
        customer sees on their calendar.
      </p>
    </SectionCard>
  ) : null;

  return (
    <>
      <HolidayBanner closed={closed} />
      <SectionCard title="Day">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <LabelDatePicker date={date} today={today} />
          <div className="flex gap-2">
            <LabelsExportButton sheet={packing} dateIso={date} />
            <LabelsPrintButton
              dateIso={date}
              weekStart={sheet.weekStart}
              menuReleased={sheet.menuWeekPublicId != null}
              labelCount={sheet.labels.length}
            />
          </div>
        </div>
      </SectionCard>

      <StatCards
        items={[
          { icon: PackageIcon, label: "Orders", value: packing.rows.length, hint: "one row per tiffin (eating day)" },
          // Same number Dispatch shows as stops: held, paused and cancelled rows are listed but not going out.
          { icon: TruckIcon, label: "Stops", value: deliveries.filter((d) => GOING_OUT.has(d.status)).length, hint: `going out · ${deliveries.length} listed` },
          { icon: LayoutListIcon, label: "Item slots", value: packing.itemHeaders.length, hint: "columns on the packing sheet" },
          { icon: BoxIcon, label: "Containers", value: containers, hint: "to pack for this day" },
          sheet.menuWeekPublicId
            ? { icon: CalendarDaysIcon, label: "Menu week", value: sheet.weekStart, hint: "released" }
            : { icon: CalendarDaysIcon, label: "Menu week", value: "Not released", tone: "bad", hint: "kitchen counts and labels wait on it" },
        ]}
      />

      <LabelsTabs
        date={date}
        counts={{
          packing: packing.rows.length,
          // Same number Dispatch shows as stops: held, paused and cancelled rows are listed but not going out.
          deliveries: deliveries.filter((d) => GOING_OUT.has(d.status)).length,
          kitchen: sheet.counts.length,
          labels: sheet.labels.length,
        }}
        panels={{
          packing: (
            <SectionCard title="Packing sheet">
              <LabelsTable sheet={packing} />
            </SectionCard>
          ),
          deliveries: (
            <SectionCard title="Deliveries">
              <DeliveryStatusList rows={deliveries} />
            </SectionCard>
          ),
          kitchen: noMenu ?? (
            <SectionCard title="Kitchen counts">
              <KitchenCounts counts={sheet.counts} byRoute={sheet.byRoute} />
            </SectionCard>
          ),
          labels: noMenu ?? (
            <SectionCard title="Labels">
              <LabelList labels={sheet.labels} />
            </SectionCard>
          ),
        }}
      />
    </>
  );
}

LabelsData.Skeleton = function LabelsDataSkeleton() {
  return (
    <>
      <SectionCard title="Day">
        <Skeleton className="h-9 w-64" />
      </SectionCard>
      <StatCardsSkeleton count={5} />
      <Skeleton className="h-9 w-full max-w-xl" />
      <SectionCard title="Packing sheet">
        <Skeleton className="h-96 w-full" />
      </SectionCard>
    </>
  );
};
