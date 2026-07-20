"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDaysIcon, PalmtreeIcon, PlayIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, CardContent, EmptyState, PageHeader, SkeletonListRows } from "@/components/ds";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerDelivery, myPausePanel, Subscription, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import { WaitlistCard } from "@/components/customer/home/waitlist-card";
import { formatDateOnly } from "@/lib/format/datetime";
import type { DeliveryCardMeal } from "./meal-chips";
import { VacationControl, cutoffByDateFromDeliveries } from "./vacation-control";
import { MonthCalendar } from "./month-calendar";
import { DayDetail } from "./day-detail";
import { MobileDayOrderCard, MobileLegendRow } from "./mobile-day-order-card";
import { SubscriptionPlanHeader } from "./subscription-items";
import { toIsoLocal, type CalendarCell } from "./calendar-constants";
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

function deliveriesHref(monthKey: string, selectedPublicId?: string) {
  const params = new URLSearchParams();
  params.set("month", monthKey);
  if (selectedPublicId) params.set("sub", selectedPublicId);
  return `/me/deliveries?${params.toString()}`;
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

function TiffinCalendarSection({
  sub,
  allSubscriptions,
  deliveries,
  pausePanel,
  calendarDays,
  categoryLabels,
  tz,
  today,
  monthKey,
  onVacationClick,
}: {
  sub: Subscription;
  allSubscriptions: Subscription[];
  deliveries: DeliveryCardData[];
  pausePanel: PausePanel;
  calendarDays: CalendarCell[];
  categoryLabels: Record<string, string>;
  tz: string;
  today: string;
  monthKey: string;
  onVacationClick: () => void;
}) {
  const router = useRouter();
  const todayIso = today || toIsoLocal(new Date());
  const deliveryDatesKey = calendarDays.map((c) => c.date).sort().join(",");
  const initialSelected = (() => {
    const dates = deliveryDatesKey ? deliveryDatesKey.split(",") : [];
    if (dates.includes(todayIso)) return todayIso;
    const next = dates.find((d) => d >= todayIso);
    return next ?? todayIso;
  })();
  const [selected, setSelected] = useState(initialSelected);
  const calendarDaysRef = useRef(calendarDays);
  calendarDaysRef.current = calendarDays;

  // Re-anchor when the app-day rolls — not when the viewed month changes.
  useEffect(() => {
    const dates = calendarDaysRef.current.map((c) => c.date).sort();
    if (dates.includes(todayIso)) {
      setSelected(todayIso);
      return;
    }
    const next = dates.find((d) => d >= todayIso);
    setSelected(next ?? todayIso);
  }, [todayIso]);

  const cellsByDate = useMemo(() => new Map(calendarDays.map((c) => [c.date, c])), [calendarDays]);
  const deliveryByDate = useMemo(() => new Map(deliveries.map((d) => [d.deliveryDate, d])), [deliveries]);

  function onChanged() {
    router.refresh();
  }

  function switchSubscription(publicId: string) {
    router.push(deliveriesHref(monthKey, publicId));
  }

  function changeMonth(nextMonth: string) {
    router.push(deliveriesHref(nextMonth, sub.publicId));
  }

  const monthCalendarProps = {
    cellsByDate,
    selected,
    onSelect: setSelected,
    todayIso,
    monthKey,
    onMonthChange: changeMonth,
  };

  const selectedCell = cellsByDate.get(selected);
  const selectedDelivery = deliveryByDate.get(selected);
  const subPaused = pausePanel.usage.hasOpenPause || sub.status === "paused";

  return (
    <section className="space-y-3">
      <SubscriptionPlanHeader
        sub={sub}
        allSubscriptions={allSubscriptions}
        categoryLabels={categoryLabels}
        onSwitch={switchSubscription}
      />

      <div className="space-y-2.5 md:hidden">
        <MobileLegendRow />
        <MonthCalendar {...monthCalendarProps} />
        <p className="text-center text-sm font-medium">
          {formatDateOnly(selected, { mode: "long" })}
        </p>
        <MobileDayOrderCard
          dateIso={selected}
          cell={selectedCell}
          delivery={selectedDelivery}
          planName={sub.planName}
          paused={subPaused}
          onPauseClick={onVacationClick}
        />
        <DayDetail
          variant="picker"
          dateIso={selected}
          cell={selectedCell}
          delivery={selectedDelivery}
          orderPublicId={sub.publicId}
          categoryLabels={categoryLabels}
          categoryCounts={sub.categoryCounts}
          tz={tz}
          onChanged={onChanged}
        />
      </div>

      <div className="hidden space-y-3 md:block">
        <DesktopDayStatusLegend />
        <div className="grid items-start gap-4 md:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          <Card variant="flat" className="p-3 sm:p-4">
            <CardContent className="p-0">
              <MonthCalendar {...monthCalendarProps} />
            </CardContent>
          </Card>
          <Card variant="flat" className="min-w-0 p-4 sm:p-5">
            <CardContent className="p-0">
              <DayDetail
                dateIso={selected}
                cell={selectedCell}
                delivery={selectedDelivery}
                orderPublicId={sub.publicId}
                categoryLabels={categoryLabels}
                categoryCounts={sub.categoryCounts}
                tz={tz}
                onChanged={onChanged}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export function DeliveryCalendar({
  subscriptions,
  selectedPublicId,
  deliveries,
  pausePanels = {},
  calendarCells = {},
  categoryLabels = {},
  monthKey = "",
  waitlisted = [],
  today = "",
}: {
  subscriptions: Subscription[];
  selectedPublicId?: string;
  deliveries: DeliveryCardData[];
  pausePanels?: Record<string, PausePanel>;
  calendarCells?: Record<string, CalendarCell[]>;
  categoryLabels?: Record<string, string>;
  monthKey?: string;
  waitlisted?: WaitlistedSubscription[];
  today?: string;
}) {
  const tz = useTimezone();
  const [vacationOpen, setVacationOpen] = useState(false);

  if (subscriptions.length === 0) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-5">
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

  const selected =
    subscriptions.find((s) => s.publicId === selectedPublicId) ?? subscriptions[0]!;
  const selectedDeliveries = deliveries.filter((d) => d.orderPublicId === selected.publicId);
  const pausePanel = pausePanels[selected.publicId] ?? DEFAULT_PAUSE_PANEL;
  const subOnVacation = pausePanel.usage.hasOpenPause || selected.status === "paused";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeader
        icon={CalendarDaysIcon}
        title="My deliveries"
        subtitle="Month calendar, day details, and vacation pause for your plan."
        actions={
          <Button
            type="button"
            variant={subOnVacation ? "secondary" : "outline"}
            size="sm"
            onClick={() => setVacationOpen(true)}
          >
            {subOnVacation ? (
              <PlayIcon data-icon="inline-start" />
            ) : (
              <PalmtreeIcon data-icon="inline-start" />
            )}
            {subOnVacation ? "Resume" : "Vacation"}
          </Button>
        }
      />
      <VacationControl
        sub={selected}
        pausePanel={pausePanel}
        cutoffByDate={cutoffByDateFromDeliveries(selectedDeliveries)}
        today={today || toIsoLocal(new Date())}
        open={vacationOpen}
        onOpenChange={setVacationOpen}
        hideTrigger
      />
      <TiffinCalendarSection
        key={selected.publicId}
        sub={selected}
        allSubscriptions={subscriptions}
        deliveries={selectedDeliveries}
        pausePanel={pausePanel}
        calendarDays={calendarCells[selected.publicId] ?? []}
        categoryLabels={categoryLabels}
        tz={tz}
        today={today}
        monthKey={monthKey}
        onVacationClick={() => setVacationOpen(true)}
      />
    </div>
  );
}

export function DeliveryCalendarSkeleton() {
  return (
    <div className="space-y-5 p-4 pb-6">
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
