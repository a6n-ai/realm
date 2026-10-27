"use client";
import { ChevronLeft, ChevronRight, Info, Truck } from "lucide-react";
import { Popover } from "radix-ui";
import { STATUS_COLOR, STATUS_LABEL, type DeliveryStatus } from "@/components/customer/kit";
import { cn, FOCUS } from "@/components/customer/kit/cn";
import { TripTimeline } from "@/components/wizard/trip-timeline";
import { addDays, mondayOf, weekDays, weekTimeline, type Agenda } from "@/lib/deliveries-view/week";
import type { DayOfWeek } from "@/lib/menu/delivery-days";
import { useSwipePages } from "@/components/customer/kit/use-swipe-pages";

const DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const MON = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Bare chevron, 44px hit area, no circle or outline. */
export const ARROW = cn(FOCUS, "grid size-11 place-items-center text-[var(--muted-foreground,#6E6558)] transition-colors hover:text-[var(--foreground)] disabled:opacity-30 [touch-action:manipulation]");
const LEGEND: DeliveryStatus[] = ["delivered", "upcoming", "hold", "paused", "holiday"];

interface Props {
  firstWeek: string;
  lastWeek: string;
  week: string;
  today: string;
  selectedDay: string | null;
  agenda: Agenda;
  now: number;
  onPickDay: (iso: string) => void;
  onWeek: (monday: string) => void;
  /** Picker mode (move sheet): days that can't be chosen, and what to do when one is tapped. */
  isDisabled?: (iso: string) => boolean;
  onDisabledTap?: (iso: string) => void;
  /** Days a delivery could run on (move sheet); labelled and drawn as a dashed truck when none is scheduled. */
  deliveryDay?: (iso: string) => boolean;
}

/** The deliveries week as the subscribe flow's trip timeline: trucks and bars in delivery-status colours, days tappable. */
export function WeekTimeline({ firstWeek, lastWeek, week, today, selectedDay, agenda, now, onPickDay, onWeek, isDisabled, onDisabledTap, deliveryDay }: Props) {
  const { trips, dayStatus } = weekTimeline(agenda, week, now);
  const isos = weekDays(week);
  const thisWeek = mondayOf(today);
  const dimBefore = week < thisWeek ? 7 : week > thisWeek ? 0 : isos.indexOf(today);
  const byDay = new Map(trips.map((t) => [t.day, t]));
  const canPrev = week > firstWeek;
  const canNext = week < lastWeek;
  const { ref, bind, go } = useSwipePages({ page: week, canPrev, canNext, step: (dir) => onWeek(addDays(week, 7 * dir)) });

  return (
    <section aria-label="Delivery week" className="c-surface overflow-x-clip rounded-[20px] bg-[var(--card,#fff)] p-4 sm:p-5" data-testid="week-timeline">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground,#6E6558)]">
          {MON.format(at(week))} – {MON.format(at(addDays(week, 6)))}{week === thisWeek ? " · This week" : ""}
        </p>
        <span className="flex items-center">
          <Legend />
          <button type="button" aria-label="Previous week" disabled={!canPrev} onClick={() => go(-1)} className={ARROW}><ChevronLeft aria-hidden className="size-5" /></button>
          <button type="button" aria-label="Next week" disabled={!canNext} onClick={() => go(1)} className={ARROW}><ChevronRight aria-hidden className="size-5" /></button>
        </span>
      </div>
      <div ref={ref} className="[touch-action:pan-y] motion-reduce:!transform-none" {...bind}>
      <TripTimeline
        weekStart={week}
        trips={trips.map((t) => ({ ...t, color: STATUS_COLOR[t.status] }))}
        dayColor={(d) => (dayStatus[d] ? STATUS_COLOR[dayStatus[d]!] : undefined)}
        pick={{
          selected: selectedDay && mondayOf(selectedDay) === week ? DAYS[isos.indexOf(selectedDay)]! : null,
          today: week === thisWeek ? DAYS[isos.indexOf(today)]! : null,
          dimBefore,
          onPick: (d) => onPickDay(isos[DAYS.indexOf(d)]!),
          disabled: isDisabled && ((d) => isDisabled(isos[DAYS.indexOf(d)]!)),
          onDisabledTap: onDisabledTap && ((d) => onDisabledTap(isos[DAYS.indexOf(d)]!)),
          deliveryDay: deliveryDay && ((d) => deliveryDay(isos[DAYS.indexOf(d)]!)),
          label: (d) => {
            const iso = isos[DAYS.indexOf(d)]!;
            const s = dayStatus[d];
            const trip = byDay.get(d);
            const holiday = s === "holiday" ? agenda[iso]?.find((x) => x.holiday)?.holiday : null;
            return `${LONG.format(at(iso))}${s ? `, eating, ${STATUS_LABEL[s]}${holiday ? `: ${holiday}` : ""}` : ", nothing planned"}${trip ? `, delivery arrives with ${trip.units} ${trip.units === 1 ? "tiffin" : "tiffins"}` : ""}${deliveryDay?.(iso) ? ", delivery day" : ""}`;
          },
        }}
        legend={null}
      />
      </div>
    </section>
  );
}

/** Tap or click: hover-only tooltips never open on phones. */
export function Legend() {
  return (
    <Popover.Root>
      <Popover.Trigger aria-label="What the colours mean" className={cn(FOCUS, "grid size-11 place-items-center text-[var(--muted-foreground,#6E6558)] transition-colors hover:text-[var(--foreground)] [touch-action:manipulation]")}>
        <Info aria-hidden className="size-4" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-56 c-surface rounded-2xl bg-[var(--card,#fff)] p-3 text-[13px] text-[var(--foreground)] shadow-lg">
          <p className="flex items-center gap-2 pb-2">
            <Truck aria-hidden className="size-4 shrink-0" />
            Delivery day; the number is how many tiffins arrive.
          </p>
          <ul className="space-y-1.5 border-t border-[var(--border)] pt-2">
            {LEGEND.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
