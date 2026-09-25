import { Suspense } from "react";
import { TagIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dailyLabelSheet } from "@/lib/services/daily-labels.service";
import { getKitchenPackingSheet } from "@/lib/services/kitchen-packing-sheet.service";
import { PageShell, PageHeader, SectionCard, SkeletonStatCards, StatGrid } from "@/components/ds";
import { LabelDatePicker } from "./label-date-picker";
import { LabelsExportButton } from "./labels-export-button";
import { LabelsPrintButton } from "./labels-print-button";
import { LabelsTable } from "./labels-table";
import { KitchenCounts, LabelList } from "./labels-view";

type SearchParams = Promise<{ date?: string }>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default function LabelsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={TagIcon}
        title="Daily labels"
        subtitle="Kitchen packing sheet and container labels for one delivery day."
      />
      <Suspense fallback={<LabelsData.Skeleton />}>
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

  const [sheet, packing] = await Promise.all([dailyLabelSheet(date), getKitchenPackingSheet(date)]);
  const containers = sheet.counts.reduce((n, c) => n + c.count, 0);

  return (
    <>
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

      <StatGrid
        cols={4}
        items={[
          { label: "Orders", value: packing.rows.length, hint: "one row per tiffin (eating day)" },
          { label: "Item slots", value: packing.itemHeaders.length },
          { label: "Containers", value: containers },
          { label: "Menu week", value: sheet.menuWeekPublicId ? sheet.weekStart : "not released" },
        ]}
      />

      <SectionCard title="Packing sheet">
        <LabelsTable sheet={packing} />
      </SectionCard>

      {sheet.menuWeekPublicId == null ? (
        <SectionCard title="No menu released">
          <p className="text-muted-foreground text-sm">
            No menu week is released for the week of {sheet.weekStart}, so the dishes for this day
            cannot be resolved. Release that week first — labels must show the same meal the
            customer sees on their calendar.
          </p>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Kitchen counts">
            <KitchenCounts counts={sheet.counts} byRoute={sheet.byRoute} />
          </SectionCard>
          <SectionCard title="Labels">
            <LabelList labels={sheet.labels} />
          </SectionCard>
        </>
      )}
    </>
  );
}

LabelsData.Skeleton = function LabelsDataSkeleton() {
  return (
    <>
      <SectionCard title="Day">
        <Skeleton className="h-9 w-64" />
      </SectionCard>
      <SkeletonStatCards count={4} />
      <SectionCard title="Packing sheet">
        <Skeleton className="h-64 w-full" />
      </SectionCard>
      <SectionCard title="Kitchen counts">
        <Skeleton className="h-40 w-full" />
      </SectionCard>
      <SectionCard title="Labels">
        <Skeleton className="h-64 w-full" />
      </SectionCard>
    </>
  );
};
