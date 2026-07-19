"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDaysIcon, UtensilsCrossedIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import { Card, CardContent, EmptyState, PageHeader, SkeletonListRows } from "@/components/ds";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@realm/ui/drawer";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { CustomerActivity, CustomerDelivery, myPausePanel, Subscription, WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import { WaitlistCard } from "@/components/customer/home/waitlist-card";
import { TransitionLink } from "@/components/motion/transition-link";
import { formatDateOnly } from "@/lib/format/datetime";
import { DeliveryHistory } from "./delivery-history";
import type { DeliveryCardMeal } from "./meal-chips";
import { PauseControl } from "./pause-calendar";
import { MonthCalendar } from "./month-calendar";
import { WeekRail } from "./week-rail";
import { DayDetail } from "./day-detail";
import { toIsoLocal, SUB_STATUS_LABEL, type CalendarCell } from "./calendar-constants";

type Address = { fullName: string; addressLine: string; city: string; postalCode: string };

export type DeliveryCardData = CustomerDelivery & {
  meal: DeliveryCardMeal;
  address: Address;
  hasAddressOverride: boolean;
};

export type PausePanel = Awaited<ReturnType<typeof myPausePanel>>;

// Defensive fallback only — page.tsx fetches a PausePanel for every active subscription, so this
// is never expected to be hit, but it keeps the section's props total if it ever is.
const DEFAULT_PAUSE_PANEL: PausePanel = {
  limits: { maxPauses: null, maxPauseDaysTotal: null, maxPauseStretchDays: null },
  usage: { count: 0, daysUsed: 0, hasOpenPause: false },
};

// One subscription's Tiffin Calendar: desktop month calendar + persistent detail panel beside it;
// mobile week rail + bottom Drawer. Day-tap is meal selection ONLY — pause/resume lives in its
// own PauseControl trigger, never on the calendar surface itself.
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
  const [drawerOpen, setDrawerOpen] = useState(false);

  const cellsByDate = useMemo(() => new Map(calendarDays.map((c) => [c.date, c])), [calendarDays]);
  const deliveryByDate = useMemo(() => new Map(deliveries.map((d) => [d.deliveryDate, d])), [deliveries]);
  const cutoffByDate = useMemo(() => new Map(deliveries.map((d) => [d.deliveryDate, d.cutoffAt])), [deliveries]);

  function onChanged() {
    router.refresh();
  }

  function selectDesktop(iso: string) {
    setSelected(iso);
  }

  function selectMobile(iso: string) {
    setSelected(iso);
    setDrawerOpen(true);
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold">{sub.planName}</h2>
          <span className="text-muted-foreground text-xs">{SUB_STATUS_LABEL[sub.status as "active" | "paused"]}</span>
        </div>
        <PauseControl sub={sub} pausePanel={pausePanel} cutoffByDate={cutoffByDate} today={todayIso} />
      </div>

      {/* Desktop: month calendar + persistent detail panel */}
      <Card variant="flat" className="hidden p-4 md:block">
        <CardContent className="grid gap-4 p-0 md:grid-cols-[auto_1fr]">
          <MonthCalendar cellsByDate={cellsByDate} selected={selected} onSelect={selectDesktop} todayIso={todayIso} />
          <DayDetail
            dateIso={selected}
            cell={cellsByDate.get(selected)}
            delivery={deliveryByDate.get(selected)}
            orderPublicId={sub.publicId}
            categoryLabels={categoryLabels}
            tz={tz}
            onChanged={onChanged}
          />
        </CardContent>
      </Card>

      {/* Mobile: week rail + bottom Drawer */}
      <div className="md:hidden">
        <WeekRail cellsByDate={cellsByDate} selected={selected} onSelect={selectMobile} todayIso={todayIso} />
      </div>
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="md:hidden">
          <DrawerHeader className="text-left">
            <DrawerTitle>{formatDateOnly(selected, { mode: "weekday" })}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <DayDetail
              dateIso={selected}
              cell={cellsByDate.get(selected)}
              delivery={deliveryByDate.get(selected)}
              orderPublicId={sub.publicId}
              categoryLabels={categoryLabels}
              tz={tz}
              onChanged={onChanged}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </section>
  );
}

export function DeliveryCalendar({
  subscriptions,
  deliveries,
  pausePanels = {},
  calendarCells = {},
  categoryLabels = {},
  waitlisted = [],
  history = [],
  activity = [],
  today = "",
}: {
  subscriptions: Subscription[];
  deliveries: DeliveryCardData[];
  pausePanels?: Record<string, PausePanel>;
  calendarCells?: Record<string, CalendarCell[]>;
  categoryLabels?: Record<string, string>;
  extraWindows?: number;
  waitlisted?: WaitlistedSubscription[];
  history?: CustomerDelivery[];
  activity?: CustomerActivity[];
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
        <DeliveryHistory history={history} activity={activity} today={today} />
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
      <PageHeader
        icon={CalendarDaysIcon}
        title="My deliveries"
        actions={
          <Button asChild variant="outline" size="sm">
            <TransitionLink href="/me/meals">
              <UtensilsCrossedIcon data-icon="inline-start" /> Pick your meals
            </TransitionLink>
          </Button>
        }
      />
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
      <DeliveryHistory history={history} activity={activity} today={today} />
    </div>
  );
}

// Exact loading twin: named export, not DeliveryCalendar.Skeleton — page.tsx is a Server
// Component and cannot dot into this "use client" module.
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
