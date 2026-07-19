"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDaysIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, CardContent, EmptyState, PageHeader, SkeletonListRows } from "@/components/ds";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerDelivery, myPausePanel, Subscription, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import { WaitlistCard } from "@/components/customer/home/waitlist-card";
import { formatDateOnly } from "@/lib/format/datetime";
import type { DeliveryCardMeal } from "./meal-chips";
import { PauseControl } from "./pause-calendar";
import { MonthCalendar } from "./month-calendar";
import { DayDetail } from "./day-detail";
import { MobileDayOrderCard, MobileLegendRow } from "./mobile-day-order-card";
import { MAX_EXTRA_WINDOWS, toIsoLocal, SUB_STATUS_LABEL, type CalendarCell } from "./calendar-constants";
import { CALENDAR_LEGEND } from "./day-status";

function DesktopDayStatusLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {CALENDAR_LEGEND.map(({ key, label, dashClass }) => (
        <span key={key} className="flex items-center gap-1.5">
          <span className={cn("h-[3px] w-5 rounded-full", dashClass)} aria-hidden />
          {label}
        </span>
      ))}
    </div>
  );
}

function LoadMoreCalendar({ extraWindows }: { extraWindows: number }) {
  const atMax = extraWindows >= MAX_EXTRA_WINDOWS;
  if (atMax) {
    return (
      <p className="text-center text-xs text-muted-foreground">
        Showing the maximum calendar window.
      </p>
    );
  }
  return (
    <div className="flex justify-center">
      <Button asChild variant="outline" size="sm">
        <Link href={`/me/deliveries?days=${extraWindows + 1}`}>Load more weeks</Link>
      </Button>
    </div>
  );
}

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };

export type DeliveryCardData = CustomerDelivery & {
  meal: DeliveryCardMeal;
  address: Address;
  hasAddressOverride: boolean;
};

export type PausePanel = Awaited<ReturnType<typeof myPausePanel>>;

const DEFAULT_PAUSE_PANEL: PausePanel = {
  limits: { maxPauses: null, maxPauseDaysTotal: null, maxPauseStretchDays: null },
  usage: { count: 0, daysUsed: 0, hasOpenPause: false },
};

function TiffinCalendarSection({ sub, deliveries, pausePanel, calendarDays, categoryLabels, tz, today }: {
  sub: Subscription;
  deliveries: DeliveryCardData[];
  pausePanel: PausePanel;
  calendarDays: CalendarCell[];
  categoryLabels: Record<string, string>;
  tz: string;
  today: string;
}) {
  const router = useRouter();
  const todayIso = today || toIsoLocal(new Date());
  const [selected, setSelected] = useState(todayIso);
  const [pauseOpen, setPauseOpen] = useState(false);

  // Always land on today when the page loads or the app-day rolls over.
  useEffect(() => {
    setSelected(todayIso);
  }, [todayIso]);

  const cellsByDate = useMemo(() => new Map(calendarDays.map((c) => [c.date, c])), [calendarDays]);
  const deliveryByDate = useMemo(() => new Map(deliveries.map((d) => [d.deliveryDate, d])), [deliveries]);
  const cutoffByDate = useMemo(() => new Map(deliveries.map((d) => [d.deliveryDate, d.cutoffAt])), [deliveries]);

  function onChanged() {
    router.refresh();
  }

  const selectedCell = cellsByDate.get(selected);
  const selectedDelivery = deliveryByDate.get(selected);
  const subPaused = pausePanel.usage.hasOpenPause || sub.status === "paused";

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{sub.planName}</h2>
          <span className="text-muted-foreground text-xs">{SUB_STATUS_LABEL[sub.status as "active" | "paused"]}</span>
        </div>
        <Button
          type="button"
          variant={subPaused ? "secondary" : "outline"}
          size="sm"
          className="hidden md:inline-flex"
          onClick={() => setPauseOpen(true)}
        >
          {subPaused ? "Resume" : "Pause"}
        </Button>
        <PauseControl
          sub={sub}
          pausePanel={pausePanel}
          cutoffByDate={cutoffByDate}
          today={todayIso}
          open={pauseOpen}
          onOpenChange={setPauseOpen}
          hideTrigger
        />
      </div>

      <div className="space-y-3 md:hidden">
        <MobileLegendRow />
        <MonthCalendar
          cellsByDate={cellsByDate}
          selected={selected}
          onSelect={setSelected}
          todayIso={todayIso}
        />
        <p className="text-center text-sm font-medium">
          {formatDateOnly(selected, { mode: "long" })}
        </p>
        <MobileDayOrderCard
          cell={selectedCell}
          delivery={selectedDelivery}
          planName={sub.planName}
          paused={subPaused}
          onPauseClick={() => setPauseOpen(true)}
        />
        <DayDetail
          variant="picker"
          dateIso={selected}
          cell={selectedCell}
          delivery={selectedDelivery}
          orderPublicId={sub.publicId}
          categoryLabels={categoryLabels}
          tz={tz}
          onChanged={onChanged}
        />
      </div>

      <div className="hidden space-y-3 md:block">
        <DesktopDayStatusLegend />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr] lg:items-start">
          <Card variant="flat" className="p-3 sm:p-4">
            <CardContent className="p-0">
              <MonthCalendar
                cellsByDate={cellsByDate}
                selected={selected}
                onSelect={setSelected}
                todayIso={todayIso}
              />
            </CardContent>
          </Card>
          <DayDetail
            dateIso={selected}
            cell={selectedCell}
            delivery={selectedDelivery}
            orderPublicId={sub.publicId}
            categoryLabels={categoryLabels}
            tz={tz}
            onChanged={onChanged}
          />
        </div>
      </div>
    </section>
  );
}

export function DeliveryCalendar({
  subscriptions,
  deliveries,
  pausePanels = {},
  calendarCells = {},
  categoryLabels = {},
  extraWindows = 0,
  waitlisted = [],
  today = "",
}: {
  subscriptions: Subscription[];
  deliveries: DeliveryCardData[];
  pausePanels?: Record<string, PausePanel>;
  calendarCells?: Record<string, CalendarCell[]>;
  categoryLabels?: Record<string, string>;
  extraWindows?: number;
  waitlisted?: WaitlistedSubscription[];
  today?: string;
}) {
  const tz = useTimezone();

  if (subscriptions.length === 0) {
    return (
      <div className="space-y-6 p-4">
        <div className="space-y-3">
          {waitlisted.length > 0 ? (
            waitlisted.map((s) => <WaitlistCard key={s.publicId} sub={s} />)
          ) : (
            <EmptyState
              icon={CalendarDaysIcon}
              message="No active subscriptions yet."
              action={
                <Button asChild size="sm">
                  <Link href="/subscribe">Browse plans</Link>
                </Button>
              }
            />
          )}
        </div>
      </div>
    );
  }

  const bySub = new Map<string, DeliveryCardData[]>(subscriptions.map((s) => [s.publicId, []]));
  for (const d of deliveries) {
    const list = bySub.get(d.orderPublicId);
    if (list) list.push(d);
  }

  return (
    <div className="space-y-6 p-4">
      <PageHeader icon={CalendarDaysIcon} title="My deliveries" />
      {subscriptions.map((sub) => (
        <TiffinCalendarSection
          key={sub.publicId}
          sub={sub}
          deliveries={bySub.get(sub.publicId) ?? []}
          pausePanel={pausePanels[sub.publicId] ?? DEFAULT_PAUSE_PANEL}
          calendarDays={calendarCells[sub.publicId] ?? []}
          categoryLabels={categoryLabels}
          tz={tz}
          today={today}
        />
      ))}
      <LoadMoreCalendar extraWindows={extraWindows} />
    </div>
  );
}

export function DeliveryCalendarSkeleton() {
  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-7 w-40" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-32" />
          <SkeletonListRows rows={3} />
        </div>
      ))}
    </div>
  );
}
