"use client";
import { CalendarClock, Clock } from "lucide-react";
import { Card, Chip, Countdown, Pill, StatusRing, type DeliveryStatus, type Tone } from "@/components/customer/kit";
import { cn, FONT, FOCUS, SPRING } from "@/components/customer/kit/cn";
import { formatCutoff, humanDate, type EatingDay, type Trip } from "@/lib/deliveries-view";

const WD = new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const dayNum = (iso: string) => d(iso).getUTCDate();
export const weekday = (iso: string) => WD.format(d(iso));

export function statusMeta(t: Trip): { label: string; tone: Tone; dot: DeliveryStatus | null } {
  switch (t.status) {
    case "upcoming": return { label: t.isMakeup ? "Make-up" : "Upcoming", tone: "up", dot: "upcoming" };
    case "delivered": return { label: "Delivered", tone: "ok", dot: "delivered" };
    case "cutoff-passed": return { label: "Being prepared", tone: "ok", dot: "delivered" };
    case "hold": return { label: t.pooled ? "On hold · in pool" : "On hold", tone: "hold", dot: "hold" };
    case "rescheduled": return { label: "Moved", tone: "hold", dot: "hold" };
    case "locked": return { label: "Closed", tone: "neutral", dot: "hold" };
    case "vacation": return { label: "Vacation", tone: "vac", dot: "vacation" };
    case "combined-into": return { label: "Combined", tone: "neutral", dot: "combined" };
  }
}

export const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function rowSubline(t: Trip, tz: string): string {
  if (t.status === "combined-into" && t.mergedInto) return `Combined into ${humanDate(t.mergedInto)}`;
  if (t.coversLabel) return t.coversLabel;
  if (t.isMakeup) return "Make-up delivery";
  if (t.status === "upcoming") return `Closes ${formatCutoff(t.cutoffAt, tz)}`;
  return humanDate(t.date);
}

export function TripRow({ trip, tz, selected, onSelect }: { trip: Trip; tz: string; selected: boolean; onSelect: (date: string) => void }) {
  const m = statusMeta(trip);
  return (
    <button
      type="button"
      data-testid="trip-row"
      aria-pressed={selected}
      aria-label={`${humanDate(trip.date)}, ${m.label}`}
      onClick={() => onSelect(trip.date)}
      className={cn(
        FONT, FOCUS, SPRING,
        "flex min-h-16 w-full items-center gap-3 rounded-2xl border-[1.5px] px-2.5 py-2 text-left transition-[transform,border-color,background-color] duration-150 [touch-action:manipulation] active:scale-[.985] motion-reduce:transition-none",
        selected ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)]/40" : "border-transparent hover:bg-[var(--muted)]",
      )}
    >
      <span className="flex w-11 shrink-0 flex-col items-center leading-tight">
        <span className="text-xs font-medium text-[var(--muted-foreground,#6E6558)]">{weekday(trip.date)}</span>
        <StatusRing status={m.dot === "delivered" ? "delivered" : m.dot === "combined" ? "combined" : undefined} className="size-9">
          <b className="text-[17px] tabular-nums">{dayNum(trip.date)}</b>
        </StatusRing>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{trip.status === "combined-into" ? "Nothing arrives" : tiffins(trip.units)}</span>
        <span className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">{rowSubline(trip, tz)}</span>
      </span>
      <Pill tone={m.tone}>{m.label}</Pill>
    </button>
  );
}

function DishChips({ day }: { day: EatingDay }) {
  const dishes = day.dishSummary ? day.dishSummary.split(", ") : [];
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {dishes.length ? dishes.map((x, i) => <Chip key={`${i}-${x}`} className="!bg-[var(--card)]">{x}</Chip>) : <span className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Default menu</span>}
      {day.swaps.map((s, i) => <Chip key={`${i}-${s}`} tone="swap">{s}</Chip>)}
    </div>
  );
}

export function TripDetail({ trip, tz }: { trip: Trip; tz: string }) {
  const m = statusMeta(trip);
  const open = trip.status === "upcoming";
  return (
    <Card className="p-5 sm:p-6" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Pill tone={m.tone}>{m.label}</Pill>
          <h2 className="mt-3 text-[28px] font-bold leading-tight tracking-[-0.03em]">{humanDate(trip.date)}</h2>
          {trip.coversLabel && <p className="mt-1 text-[13px] text-[var(--muted-foreground,#6E6558)]">{trip.coversLabel}</p>}
        </div>
        <div className="shrink-0 text-right leading-none">
          <div className="text-[40px] font-bold tabular-nums tracking-[-0.03em]">{trip.status === "combined-into" ? 0 : trip.units}</div>
          <div className="mt-1 text-[13px] text-[var(--muted-foreground,#6E6558)]">{trip.units === 1 ? "tiffin" : "tiffins"}</div>
        </div>
      </div>
      {open && (
        <p className="mt-4 flex items-center gap-2 rounded-2xl bg-[var(--primary-wash,#FBE3D2)] px-4 py-3 text-sm font-semibold text-[#B5430B] dark:text-[#FFB877]">
          <Clock aria-hidden className="size-4 shrink-0" />
          <span>
            Changes close <Countdown target={trip.cutoffAt} timeZone={tz} />
          </span>
        </p>
      )}
      {trip.status === "combined-into" && trip.mergedInto && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[var(--muted)] px-4 py-3 text-sm">
          <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>Nothing arrives this day. Your tiffins ride along on {humanDate(trip.mergedInto)}.</span>
        </p>
      )}
      {trip.status !== "combined-into" && (
        <ul className="mt-4 space-y-3">
          {trip.eatingDays.map((e) => (
            <li key={e.date} className="rounded-2xl bg-[var(--muted)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-[15px] font-semibold">{humanDate(e.date)}</h3>
                {e.locksWith && <span className="text-xs text-[var(--muted-foreground,#6E6558)]">Locks with {weekday(e.locksWith)}&apos;s delivery</span>}
              </div>
              <DishChips day={e} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
