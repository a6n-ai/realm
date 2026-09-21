"use client";
import { Card, StatusDot, type DeliveryStatus, type Tone } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { formatCutoff, humanDate, type Trip } from "@/lib/deliveries-view";
import { deliveryLine, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";

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

export type PlanTagInfo = { color: string; label: string };
export function PlanTag({ plan }: { plan: PlanTagInfo }) {
  return (
    <span data-testid="plan-tag" className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-semibold text-[var(--foreground)]">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: plan.color }} />
      <span className="truncate">{plan.label}</span>
    </span>
  );
}

export const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function rowSubline(t: Trip, tz: string): string {
  if (t.status === "combined-into" && t.mergedInto) return `Combined into ${humanDate(t.mergedInto)}`;
  if (t.coversLabel) return t.coversLabel;
  if (t.isMakeup) return "Make-up delivery";
  if (t.status === "upcoming") return `Closes ${formatCutoff(t.cutoffAt, tz)}`;
  return humanDate(t.date);
}

export function TripRow({ trip, tz, selected, onSelect, plan }: { trip: Trip; tz: string; selected: boolean; onSelect: (trip: Trip) => void; plan?: PlanTagInfo }) {
  const m = statusMeta(trip);
  return (
    <button
      type="button"
      data-testid="trip-row"
      aria-pressed={selected}
      aria-label={`${humanDate(trip.date)}${plan ? `, ${plan.label}` : ""}, ${m.label}`}
      onClick={() => onSelect(trip)}
      className={cn(
        FONT, FOCUS,
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors [touch-action:manipulation] motion-reduce:transition-none",
        selected ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]/60",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{humanDate(trip.date)}</span>
        <span className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">{trip.status === "combined-into" ? rowSubline(trip, tz) : trip.coversLabel ?? tiffins(trip.units)}</span>
        {plan && <span className="mt-1 block"><PlanTag plan={plan} /></span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
      </span>
    </button>
  );
}

/** "Bhindi Masala, Bhindi Masala" -> "Bhindi Masala x2". */
export function dedupeDishes(summary: string | null): string[] {
  const counts = new Map<string, number>();
  for (const n of summary ? summary.split(", ") : []) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n));
}

function cutoffLine(trip: Trip, tz: string): string | null {
  return trip.status === "upcoming" ? `Changes close ${formatCutoff(trip.cutoffAt, tz)}` : null;
}

/** Header + dishes only; the desktop card slots its actions in as children. */
export function TripCard({ trip, tz, reason, plan, children }: { trip: Trip; tz: string; reason: string | null; plan?: PlanTagInfo; children?: React.ReactNode }) {
  const m = statusMeta(trip);
  const cutoff = cutoffLine(trip, tz);
  const multi = trip.eatingDays.length > 1;
  return (
    <Card className="p-5 lg:p-8" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
        {plan && <PlanTag plan={plan} />}
      </p>
      <h2 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">{humanDate(trip.date)}</h2>
      <p className="mt-1 text-[15px] text-[var(--muted-foreground,#6E6558)]">
        {[trip.coversLabel, cutoff ?? reason].filter(Boolean).join(" · ") || tiffins(trip.units)}
      </p>
      {trip.status !== "combined-into" && (
        <ul className="mt-5 space-y-3 border-t border-[var(--border)] pt-5">
          {trip.eatingDays.map((e) => {
            const dishes = dedupeDishes(e.dishSummary);
            return (
              <li key={e.date} className="text-[15px]">
                {multi && <span className="mb-0.5 block text-[13px] font-semibold text-[var(--muted-foreground,#6E6558)]">{humanDate(e.date)}</span>}
                <span className="block">{dishes.length ? dishes.join(", ") : <span className="text-[var(--muted-foreground,#6E6558)]">Default menu</span>}</span>
                {e.swaps.length > 0 && <span className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">Swapped: {e.swaps.join(", ")}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {children}
    </Card>
  );
}

const HELP = "text-[13px] text-[var(--muted-foreground,#6E6558)]";

/** One eating day of the selected week: dishes first, the delivery that feeds it as quiet second text. */
export function EatingRowButton({ row, selected, onSelect, plan }: { row: EatingRow; selected: boolean; onSelect: (row: EatingRow) => void; plan?: PlanTagInfo }) {
  const m = statusMeta(row.trip);
  const dish = dedupeDishes(row.dish).join(", ");
  return (
    <button
      type="button"
      data-testid="trip-row"
      aria-pressed={selected}
      aria-label={`${humanDate(row.date)}${plan ? `, ${plan.label}` : ""}, ${m.label}`}
      onClick={() => onSelect(row)}
      className={cn(
        FONT, FOCUS,
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors [touch-action:manipulation] motion-reduce:transition-none",
        selected ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]/60",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{humanDate(row.date)}</span>
        <span className={cn(HELP, "block truncate")}>{dish || "Default menu"}</span>
        <span className={cn(HELP, "block")}>{deliveryLine(row)}</span>
        {plan && <span className="mt-1 block"><PlanTag plan={plan} /></span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
      </span>
    </button>
  );
}

/** Selected eating day: what is eaten, the delivery block, then the actions slot. */
export function EatingCard({ row, tz, reason, plan, children }: { row: EatingRow; tz: string; reason: string | null; plan?: PlanTagInfo; children?: React.ReactNode }) {
  const { trip } = row;
  const m = statusMeta(trip);
  const dishes = dedupeDishes(row.dish);
  const covers = trip.coversDates.map(weekdayShort).join(", ");
  const done = trip.status === "delivered" || trip.status === "cutoff-passed";
  const cutoff = trip.status === "upcoming" ? `Changes close ${formatCutoff(trip.cutoffAt, tz)}` : null;
  return (
    <Card className="p-5 lg:p-8" aria-live="polite">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
        {plan && <PlanTag plan={plan} />}
      </p>
      <h2 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">
        {humanDate(row.date)} <span className="text-base font-medium text-[var(--muted-foreground,#6E6558)]">(eating)</span>
      </h2>
      <ul className="mt-4 space-y-1 text-[15px]">
        <li>{dishes.length ? dishes.join(", ") : <span className="text-[var(--muted-foreground,#6E6558)]">Default menu</span>}</li>
        {row.swaps.length > 0 && <li className={HELP}>Swapped: {row.swaps.join(", ")}</li>}
      </ul>
      <div className="mt-5 rounded-xl bg-[var(--muted)]/60 p-4" data-testid="delivery-block">
        <p className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground,#6E6558)]">Delivery</p>
        <p className="mt-1 text-[15px] font-semibold">{deliveryLine(row)}</p>
        <p className={HELP}>
          {[
            `${tiffins(trip.units)} covering ${covers}`,
            cutoff ?? (done ? null : reason),
            !row.own && trip.status === "upcoming" ? `Locks with ${weekdayShort(trip.date)}'s delivery` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      </div>
      {children}
    </Card>
  );
}
