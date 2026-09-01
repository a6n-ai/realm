"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDaysIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { Card, CardContent, EmptyState, PageHeader, SkeletonListRows } from "@/components/ds";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerDelivery, myPausePanel, Subscription, TiffinCounts, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import { WaitlistCard } from "@/components/customer/home/waitlist-card";
import { formatDateOnly } from "@/lib/format/datetime";
import type { DeliveryCardMeal } from "./meal-chips";
import { VacationControl } from "./vacation-control";
import { MonthCalendar } from "./month-calendar";
import { DayDetail, holdDeliveriesFrom } from "./day-detail";
import { MobileDayOrderCard } from "./mobile-day-order-card";
import { SubscriptionPlanHeader } from "./subscription-items";
import { toIsoLocal, pickCalendarSelectedDay, type CalendarCell } from "./calendar-constants";
import { CalendarLegend } from "./calendar-legend";

function deliveriesHref(
  basePath: string,
  monthKey: string,
  selectedPublicId?: string,
  includeSub = true,
) {
  const params = new URLSearchParams();
  params.set("month", monthKey);
  if (includeSub && selectedPublicId) params.set("sub", selectedPublicId);
  return `${basePath}?${params.toString()}`;
}

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };
// AppliedSwap.publicId is the applied-swap row's own public id (used to remove it).
export type SwapPair = { fromCategory: string; toCategory: string };
export type AppliedSwap = { publicId: string; fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number };

export type DeliveryCardData = CustomerDelivery & {
  meal: DeliveryCardMeal;
  address: Address;
  hasAddressOverride: boolean;
  hasMakeupScheduled: boolean;
  // Globally-eligible (category_swap_pairs) pairs restricted to this meal size's
  // own categories.
  swapPairs: SwapPair[];
  mealSizeCategories: string[];
  appliedSwaps: AppliedSwap[];
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
  categoryPortions = {},
  counts,
  tz,
  today,
  monthKey,
  basePath,
  onMonthChangeOverride,
  onChangedOverride,
}: {
  sub: Subscription;
  allSubscriptions: Subscription[];
  deliveries: DeliveryCardData[];
  pausePanel: PausePanel;
  calendarDays: CalendarCell[];
  categoryLabels: Record<string, string>;
  categoryPortions?: Record<string, string>;
  counts?: TiffinCounts;
  tz: string;
  today: string;
  monthKey: string;
  basePath: string;
  onMonthChangeOverride?: (monthKey: string) => void;
  onChangedOverride?: () => void;
}) {
  const router = useRouter();
  const todayIso = today || toIsoLocal(new Date());
  const deliveryDatesKey = calendarDays.map((c) => c.date).sort().join(",");
  const initialSelected = pickCalendarSelectedDay(
    deliveryDatesKey ? deliveryDatesKey.split(",") : [],
    todayIso,
  );
  const [selected, setSelected] = useState(initialSelected);
  const calendarDaysRef = useRef(calendarDays);
  // Synced in an effect, not during render: writing a ref while rendering is unsafe
  // under concurrent rendering. Declared before the effect below so the value is
  // already fresh when that one runs.
  useEffect(() => {
    calendarDaysRef.current = calendarDays;
  });

  // Re-anchor when the app-day rolls — not when the viewed month changes.
  useEffect(() => {
    const dates = calendarDaysRef.current.map((c) => c.date);
    setSelected(pickCalendarSelectedDay(dates, todayIso));
  }, [todayIso]);

  const cellsByDate = useMemo(() => new Map(calendarDays.map((c) => [c.date, c])), [calendarDays]);
  const deliveryByDate = useMemo(() => new Map(deliveries.map((d) => [d.deliveryDate, d])), [deliveries]);
  const holdDeliveries = useMemo(() => holdDeliveriesFrom(deliveries), [deliveries]);

  function onChanged() {
    if (onChangedOverride) onChangedOverride();
    else router.refresh();
  }

  const includeSub = basePath === "/me/deliveries";

  function switchSubscription(publicId: string) {
    router.push(deliveriesHref(basePath, monthKey, publicId, includeSub));
  }

  function changeMonth(nextMonth: string) {
    if (onMonthChangeOverride) {
      onMonthChangeOverride(nextMonth);
      return;
    }
    router.push(deliveriesHref(basePath, nextMonth, sub.publicId, includeSub));
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

  const dayDetailBase = {
    dateIso: selected,
    cell: selectedCell,
    delivery: selectedDelivery,
    orderPublicId: sub.publicId,
    categoryLabels,
    categoryCounts: sub.categoryCounts,
    tz,
    today: todayIso,
    tiffinCounts: counts,
    holdDeliveries,
    onChanged,
  };

  return (
    <section className="space-y-3">
      <SubscriptionPlanHeader
        sub={sub}
        allSubscriptions={allSubscriptions}
        categoryLabels={categoryLabels}
        categoryPortions={categoryPortions}
        counts={counts}
        today={todayIso}
        onSwitch={switchSubscription}
      />

      <div className="space-y-2.5 md:hidden">
        <CalendarLegend />
        <MonthCalendar {...monthCalendarProps} />
        <p className="text-center text-sm font-medium">
          {formatDateOnly(selected, { mode: "long" })}
        </p>
        <MobileDayOrderCard
          dateIso={selected}
          cell={selectedCell}
          delivery={selectedDelivery}
          mealSizeName={sub.mealSizeName}
          planName={sub.planName}
          tagLabel={sub.tagLabel}
          tagColor={sub.tagColor}
        />
        <DayDetail
          variant="picker"
          {...dayDetailBase}
          planActions={
            <VacationControl sub={sub} pausePanel={pausePanel} today={todayIso} />
          }
        />
      </div>

      <div className="hidden space-y-3 md:block">
        <CalendarLegend />
        <div className="grid items-start gap-4 md:grid-cols-[minmax(18rem,26rem)_minmax(0,1fr)]">
          <Card variant="flat" className="p-3 sm:p-4">
            <CardContent className="p-0">
              <MonthCalendar {...monthCalendarProps} />
            </CardContent>
          </Card>
          <Card variant="flat" className="min-w-0 p-4 sm:p-5">
            <CardContent className="p-0">
              <DayDetail
                {...dayDetailBase}
                planActions={
                  <VacationControl sub={sub} pausePanel={pausePanel} today={todayIso} />
                }
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
  categoryPortions = {},
  monthKey = "",
  waitlisted = [],
  today = "",
  tiffinCounts,
  basePath = "/me/deliveries",
  title = "My deliveries",
  subtitle = "Month calendar, day details, and vacation pause for your plan.",
  showHeader = true,
  showBrowsePlans = true,
  onMonthChange,
  onDeliveriesChanged,
}: {
  subscriptions: Subscription[];
  selectedPublicId?: string;
  deliveries: DeliveryCardData[];
  pausePanels?: Record<string, PausePanel>;
  calendarCells?: Record<string, CalendarCell[]>;
  categoryLabels?: Record<string, string>;
  categoryPortions?: Record<string, string>;
  monthKey?: string;
  waitlisted?: WaitlistedSubscription[];
  today?: string;
  tiffinCounts?: TiffinCounts;
  /** Month navigation base (customer `/me/deliveries` or admin `/dashboard/orders/{id}`). */
  basePath?: string;
  title?: string;
  subtitle?: string;
  /** False when an outer container (e.g. the admin order page's SectionCard) already
   * renders its own "Deliveries" heading — avoids a duplicate title/subtitle. */
  showHeader?: boolean;
  showBrowsePlans?: boolean;
  /** When set, month arrows call this instead of router navigation (admin order detail). */
  onMonthChange?: (monthKey: string) => void;
  /** When set, delivery mutations refresh via this callback. */
  onDeliveriesChanged?: () => void;
}) {
  const tz = useTimezone();

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
                showBrowsePlans ? (
                  <Button asChild size="sm">
                    <Link href="/subscribe">Browse plans</Link>
                  </Button>
                ) : undefined
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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {showHeader && (
        <PageHeader
          icon={CalendarDaysIcon}
          title={title}
          subtitle={subtitle}
        />
      )}
      <TiffinCalendarSection
        key={selected.publicId}
        sub={selected}
        allSubscriptions={subscriptions}
        deliveries={selectedDeliveries}
        pausePanel={pausePanel}
        calendarDays={calendarCells[selected.publicId] ?? []}
        categoryLabels={categoryLabels}
        categoryPortions={categoryPortions}
        counts={tiffinCounts}
        tz={tz}
        today={today}
        monthKey={monthKey}
        basePath={basePath}
        onMonthChangeOverride={onMonthChange}
        onChangedOverride={onDeliveriesChanged}
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
