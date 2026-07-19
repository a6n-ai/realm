"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addDays, startOfWeek } from "date-fns";
import { ChevronLeftIcon, ChevronRightIcon, LockIcon, PauseIcon, PlayIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Switch } from "@realm/ui/switch";
import { Calendar, CalendarDayButton } from "@realm/ui/calendar";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@realm/ui/drawer";
import { Card, CardContent } from "@/components/ds";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";
import type { Subscription } from "@/lib/services/customer-deliveries.service";
import type { DeliveryCardData, PausePanel } from "./delivery-calendar";
import { mealChips } from "./meal-chips";
import { pauseMySubscription, resumeMySubscription } from "./actions";
import { DAY_STATUS_BAR_CLASS, DAY_STATUS_DOT_CLASS, DAY_STATUS_LABEL, deliveryDayStatus, type DayStatus } from "./day-status";

// react-day-picker Day objects are constructed from local (not UTC) year/month/day fields — this
// mirrors that back to a plain "YYYY-MM-DD" so it lines up with `deliveryDate` (a calendar date,
// not an instant) regardless of the browser's own timezone. Never use parseIsoDateUtc here: that
// returns a UTC-midnight Date, which would shift by a day against the picker's local Date in any
// timezone west of UTC (the exact bug called out elsewhere in this app as "the spec-6 bug").
function toIsoLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pauseBudgetLines(limits: PausePanel["limits"], usage: PausePanel["usage"]): string[] {
  const lines: string[] = [];
  if (limits.maxPauseDaysTotal != null) {
    lines.push(`${usage.daysUsed} of ${limits.maxPauseDaysTotal} pause-days used`);
  }
  if (limits.maxPauses != null) {
    const remaining = Math.max(limits.maxPauses - usage.count, 0);
    lines.push(`${remaining} pause${remaining === 1 ? "" : "s"} left`);
  }
  if (limits.maxPauseStretchDays != null) {
    lines.push(`Up to ${limits.maxPauseStretchDays} consecutive days per pause`);
  }
  return lines;
}

function DayAgendaChip({ status, dateIso, delivery, tz }: {
  status: DayStatus;
  dateIso: string;
  delivery: DeliveryCardData | undefined;
  tz: string;
}) {
  const chips = delivery ? mealChips(delivery.meal) : [];
  return (
    <div className={cn("relative rounded-lg border bg-card py-2 pr-3 pl-6 text-sm", "after:absolute after:inset-y-2 after:left-2 after:w-1 after:rounded-full", DAY_STATUS_BAR_CLASS[status])}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium">{formatDateOnly(dateIso, { mode: "weekday" })}</p>
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          {status === "locked" && <LockIcon className="size-3" />}
          {DAY_STATUS_LABEL[status]}
        </span>
      </div>
      {!delivery ? (
        <p className="mt-1 text-muted-foreground text-xs">No delivery scheduled.</p>
      ) : "pending" in delivery.meal ? (
        <p className="mt-1 text-muted-foreground text-xs">Menu not published yet</p>
      ) : chips.length === 0 ? (
        <p className="mt-1 text-muted-foreground text-xs">Nothing scheduled</p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {chips.map((c, i) => (
            <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-xs">{c}</span>
          ))}
        </div>
      )}
      {status === "locked" && delivery && (
        <p className="mt-1 text-muted-foreground text-xs">
          Cutoff passed {formatEpoch(delivery.cutoffAt, { mode: "datetime", timeZone: tz })}
        </p>
      )}
    </div>
  );
}

function PauseForm({
  sub, pausePanel, range, indefinite, onIndefiniteChange, onSubmit, pending, error,
  resumePending, resumeError, onResume,
}: {
  sub: Subscription;
  pausePanel: PausePanel;
  range: DateRange | undefined;
  indefinite: boolean;
  onIndefiniteChange: (v: boolean) => void;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  resumePending: boolean;
  resumeError: string | null;
  onResume: () => void;
}) {
  const { limits, usage } = pausePanel;
  const budgetLines = pauseBudgetLines(limits, usage);
  const canOfferIndefinite = limits.maxPauseStretchDays == null;
  const canSubmit = indefinite ? !!range?.from : !!(range?.from && range?.to);

  if (usage.hasOpenPause || sub.status === "paused") {
    return (
      <div className="space-y-2">
        <p className="text-muted-foreground text-sm">This subscription is currently paused.</p>
        <Button variant="outline" size="sm" disabled={resumePending} onClick={onResume}>
          <PlayIcon data-icon="inline-start" /> Resume
        </Button>
        {resumeError && <p className="text-bad text-xs">{resumeError}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {budgetLines.length > 0 && (
        <ul className="text-muted-foreground text-xs">
          {budgetLines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          {range?.from
            ? indefinite
              ? `Pause from ${formatDateOnly(toIsoLocal(range.from), { mode: "short" })} until you resume`
              : range.to
                ? `Pause ${formatDateOnly(toIsoLocal(range.from), { mode: "short" })} → ${formatDateOnly(toIsoLocal(range.to), { mode: "short" })}`
                : "Pick the last paused day"
            : "Select a range on the calendar to pause"}
        </p>
      </div>
      {canOfferIndefinite && (
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={indefinite} onCheckedChange={onIndefiniteChange} size="sm" />
          Until I resume
        </label>
      )}
      <Button variant="secondary" size="sm" disabled={pending || !canSubmit} onClick={onSubmit}>
        <PauseIcon data-icon="inline-start" /> Confirm pause
      </Button>
      {error && <p className="text-bad text-xs">{error}</p>}
    </div>
  );
}

export function PauseCalendarSection({ sub, deliveries, pausePanel, tz }: {
  sub: Subscription;
  deliveries: DeliveryCardData[];
  pausePanel: PausePanel;
  tz: string;
}) {
  const router = useRouter();
  const now = Date.now();

  const byDate = useMemo(() => {
    const m = new Map<string, DeliveryCardData>();
    for (const d of deliveries) m.set(d.deliveryDate, d);
    return m;
  }, [deliveries]);

  const todayIso = useMemo(() => toIsoLocal(new Date()), []);

  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [indefinite, setIndefinite] = useState(false);
  const [pausePending, startPauseTransition] = useTransition();
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [resumePending, startResumeTransition] = useTransition();
  const [resumeError, setResumeError] = useState<string | null>(null);

  const [agendaDate, setAgendaDate] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  function isDisabledDay(date: Date): boolean {
    const iso = toIsoLocal(date);
    if (iso < todayIso) return true;
    const d = byDate.get(iso);
    if (d && now > d.cutoffAt) return true;
    return false;
  }

  function submitPause() {
    if (!range?.from) return;
    setPauseError(null);
    const fromIso = toIsoLocal(range.from);
    const untilIso = indefinite ? fromIso : toIsoLocal(range.to ?? range.from);
    startPauseTransition(async () => {
      try {
        await pauseMySubscription(sub.publicId, { from: fromIso, until: untilIso, indefinite: indefinite || undefined });
        router.refresh();
        toast.success("Subscription paused");
        setRange(undefined);
        setIndefinite(false);
        setDrawerOpen(false);
      } catch (e) {
        setPauseError(e instanceof Error ? e.message : "Failed to pause");
      }
    });
  }

  function submitResume() {
    setResumeError(null);
    startResumeTransition(async () => {
      try {
        await resumeMySubscription(sub.publicId);
        router.refresh();
        toast.success("Subscription resumed");
      } catch (e) {
        setResumeError(e instanceof Error ? e.message : "Failed to resume");
      }
    });
  }

  function DotDayButton(props: React.ComponentProps<typeof CalendarDayButton>) {
    const iso = toIsoLocal(props.day.date);
    const d = byDate.get(iso);
    const status = d ? deliveryDayStatus(d, now) : null;
    return (
      <div className="relative h-full w-full">
        <CalendarDayButton {...props} />
        {status && (
          <span
            aria-hidden
            className={cn("pointer-events-none absolute bottom-1 left-1/2 z-20 size-1.5 -translate-x-1/2 rounded-full", DAY_STATUS_DOT_CLASS[status])}
          />
        )}
      </div>
    );
  }

  const desktopAgendaIso = range?.to ? toIsoLocal(range.to) : range?.from ? toIsoLocal(range.from) : todayIso;
  const desktopAgendaDelivery = byDate.get(desktopAgendaIso);
  const desktopAgendaStatus = desktopAgendaDelivery ? deliveryDayStatus(desktopAgendaDelivery, now) : isDisabledDay(new Date(`${desktopAgendaIso}T00:00:00`)) ? "locked" : "scheduled";

  const weekStart = startOfWeek(addDays(new Date(), weekOffset * 7), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const drawerDelivery = agendaDate ? byDate.get(agendaDate) : undefined;
  const drawerStatus: DayStatus = drawerDelivery
    ? deliveryDayStatus(drawerDelivery, now)
    : agendaDate && isDisabledDay(new Date(`${agendaDate}T00:00:00`))
      ? "locked"
      : "scheduled";

  function openDay(iso: string) {
    setAgendaDate(iso);
    setDrawerOpen(true);
    if (!range?.from && !isDisabledDay(new Date(`${iso}T00:00:00`))) {
      setRange({ from: new Date(`${iso}T00:00:00`), to: undefined });
    }
  }

  return (
    <>
      {/* Desktop: month calendar + agenda panel beside/below it (c-calendar-22 pattern) */}
      <Card variant="flat" className="hidden p-4 md:block">
        <CardContent className="grid gap-4 p-0 md:grid-cols-[auto_1fr]">
          <Calendar
            mode="range"
            selected={range}
            onSelect={setRange}
            disabled={isDisabledDay}
            excludeDisabled
            components={{ DayButton: DotDayButton }}
            className="mx-auto"
          />
          <div className="space-y-3">
            <DayAgendaChip status={desktopAgendaStatus} dateIso={desktopAgendaIso} delivery={desktopAgendaDelivery} tz={tz} />
            <PauseForm
              sub={sub}
              pausePanel={pausePanel}
              range={range}
              indefinite={indefinite}
              onIndefiniteChange={setIndefinite}
              onSubmit={submitPause}
              pending={pausePending}
              error={pauseError}
              resumePending={resumePending}
              resumeError={resumeError}
              onResume={submitResume}
            />
          </div>
        </CardContent>
      </Card>

      {/* Mobile: Mon-Sun week strip + this-week/next-week toggle; tapping a day opens a Drawer */}
      <div className="space-y-2 md:hidden">
        <div className="flex items-center justify-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" disabled={weekOffset === 0} onClick={() => setWeekOffset(0)}>
            <ChevronLeftIcon className="size-4" />
          </Button>
          <span className="w-24 text-center text-xs font-medium">{weekOffset === 0 ? "This week" : "Next week"}</span>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setWeekOffset(1)}>
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {weekDays.map((date) => {
            const iso = toIsoLocal(date);
            const d = byDate.get(iso);
            const status = d ? deliveryDayStatus(d, now) : null;
            const disabled = isDisabledDay(date);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => openDay(iso)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg border py-2 text-xs",
                  disabled && "opacity-50",
                  iso === agendaDate && "border-primary",
                )}
              >
                <span className="text-muted-foreground">{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                <span className="font-medium">{date.getDate()}</span>
                <span className={cn("size-1.5 rounded-full", status ? DAY_STATUS_DOT_CLASS[status] : "bg-transparent")} />
              </button>
            );
          })}
        </div>
      </div>

      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle>{agendaDate ? formatDateOnly(agendaDate, { mode: "weekday" }) : sub.planName}</DrawerTitle>
            <DrawerDescription>{sub.planName}</DrawerDescription>
          </DrawerHeader>
          <div className="space-y-3 px-4 pb-2">
            {agendaDate && <DayAgendaChip status={drawerStatus} dateIso={agendaDate} delivery={drawerDelivery} tz={tz} />}
            <PauseForm
              sub={sub}
              pausePanel={pausePanel}
              range={range}
              indefinite={indefinite}
              onIndefiniteChange={setIndefinite}
              onSubmit={submitPause}
              pending={pausePending}
              error={pauseError}
              resumePending={resumePending}
              resumeError={resumeError}
              onResume={submitResume}
            />
            {!(pausePanel.usage.hasOpenPause || sub.status === "paused") && (
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                disabled={isDisabledDay}
                components={{ DayButton: DotDayButton }}
                className="mx-auto"
              />
            )}
          </div>
          <DrawerFooter className="pt-0">
            <Button variant="outline" onClick={() => setDrawerOpen(false)}>Close</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
