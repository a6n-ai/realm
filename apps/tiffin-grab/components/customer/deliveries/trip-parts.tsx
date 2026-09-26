"use client";
import { Info, Truck, Utensils } from "lucide-react";
import { Card, Sheet, StatusDot, type DeliveryStatus, type Tone } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { formatCutoff, humanDate, type Trip } from "@/lib/deliveries-view";
import { deliveryLine, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import type { PlanView } from "./adapter";

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
    case "combined-into": return { label: "Moved", tone: "neutral", dot: "combined" };
    case "failed": return { label: "Failed (On Hold)", tone: "hold", dot: "hold" };
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
  if (t.status === "rescheduled" && t.movedTo) return `Moved to ${humanDate(t.movedTo)}`;
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

/** One eating day of the selected week: date + dishes; a truck marks the delivery day, the "i" button (beside the row) holds the rest. */
export function EatingRowButton({ row, selected, onSelect, plan, menuOut }: { row: EatingRow; selected: boolean; onSelect: (row: EatingRow) => void; plan?: PlanTagInfo; menuOut?: boolean }) {
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
      <Utensils aria-hidden className="size-5 shrink-0 text-[var(--muted-foreground,#6E6558)]" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {humanDate(row.date)}
        </span>
        <span className={cn(HELP, "block truncate")}>{menuOut ? "Menu not released yet" : dish || "Default menu"}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
      </span>
    </button>
  );
}

/** Delivery card for the selected eating day: which truck feeds it, how many tiffins, when it locks. Dishes live in the list, not here. */
export function EatingCard({ row, tz, reason, plan, children }: { row: EatingRow; tz: string; reason: string | null; plan?: PlanTagInfo; children?: React.ReactNode }) {
  const { trip } = row;
  const m = statusMeta(trip);
  const covers = trip.coversDates.map(weekdayShort).join(" + ");
  const facts = [
    `${tiffins(trip.units)} covering ${covers}`,
    trip.status === "upcoming" ? `Changes close ${formatCutoff(trip.cutoffAt, tz)}` : reason,
    !row.own && trip.status === "upcoming" ? `${humanDate(row.date)} locks with ${weekdayShort(trip.date)}'s delivery` : null,
  ].filter(Boolean);
  return (
    <Card className="p-5 lg:p-8" aria-live="polite" data-testid="delivery-block">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
        {plan && <PlanTag plan={plan} />}
      </p>
      <h2 className="mt-1 flex items-center gap-2 text-[24px] font-bold leading-tight tracking-[-0.03em] lg:text-[30px]">
        <Truck aria-hidden className="size-6 shrink-0" />
        {deliveryLine(row)}
      </h2>
      <p className="mt-1 text-[15px] text-[var(--muted-foreground,#6E6558)]">{facts.join(" · ")}</p>
      {children}
    </Card>
  );
}

export const EXPLAIN: Record<Trip["status"], string> = {
  upcoming: "Scheduled. You can still change meals or reschedule until the cutoff.",
  delivered: "This delivery has been made.",
  "cutoff-passed": "The cutoff has passed and the kitchen is preparing it. It can no longer be changed.",
  hold: "On hold. Nothing arrives; the tiffin is returned to you. Resume it, or schedule it on another day.",
  rescheduled: "This day was moved to another day, so nothing arrives on the original date.",
  locked: "Closed. This day can no longer be changed.",
  vacation: "Your plan is on vacation, so nothing arrives. Resume deliveries to bring it back.",
  "combined-into": "Combined into another delivery.",
  failed: "Delivery failed. It is currently on hold. You can resume or reschedule it.",
};

/** Meal breakdown of one eating day (category, portion, dishes, swaps), with a compact delivery footer. */
export function TripInfoSheet({ row, tz, plan, open, onClose }: { row: EatingRow; tz: string; plan?: PlanView; open: boolean; onClose: () => void }) {
  const t = row.trip;
  const source = plan?.days.find((d) => d.date === t.date);
  const meal = row.own ? source?.meal : source?.carriedMeals?.[row.date];
  const cats = (meal ?? []).filter((c) => c.picks.length > 0);
  const slotPortion = (category: string, pickIndex: number): string | null => {
    const slots = plan?.categoryPortionSlots?.[category];
    if (slots?.length) return slots[pickIndex] ?? slots[slots.length - 1] ?? null;
    return plan?.categoryPortions[category] ?? null;
  };
  const delivery = [
    deliveryLine(row),
    `${tiffins(t.units)} covering ${t.coversDates.map(weekdayShort).join(" + ")}`,
    t.status === "upcoming" ? `changes close ${formatCutoff(t.cutoffAt, tz)}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <Sheet open={open} onClose={onClose} title={`${humanDate(row.date)} · your meal`}>
      <div className="space-y-4 pb-2 text-[15px]">
        {cats.length > 0 ? (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]" aria-label="Meal">
            {cats.map((c) => (
              <li key={c.category} className="px-4 py-3">
                <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6E6558)]">{c.label}</span>
                {c.picks.map((p, i) => {
                  const oz = slotPortion(c.category, i);
                  return (
                    <span key={`${p.dishPublicId}-${i}`} className="mt-0.5 block font-semibold">
                      {p.name}
                      {oz ? <span className="font-normal text-[var(--muted-foreground,#6E6558)]"> · {oz}</span> : null}
                      {p.isDefaulted && c.selectable && (
                        <span className="ml-2 text-[13px] font-normal text-[var(--muted-foreground,#6E6558)]">default pick</span>
                      )}
                    </span>
                  );
                })}
              </li>
            ))}
          </ul>
        ) : (
          <p>{dedupeDishes(row.dish).join(", ") || "Default menu. Your dishes appear once this week's menu is released."}</p>
        )}
        {row.swaps.length > 0 && (
          <section aria-label="Swaps">
            <h3 className="mb-1 text-sm font-semibold">Swapped</h3>
            <ul className="space-y-1 text-[14px]">{row.swaps.map((x) => <li key={x}>{x}</li>)}</ul>
          </section>
        )}
        <p className="flex items-start gap-2 text-[13px] text-[var(--muted-foreground,#6E6558)]" data-testid="info-delivery">
          <Truck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{delivery}</span>
        </p>
      </div>
    </Sheet>
  );
}

export function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn(FOCUS, "grid size-11 shrink-0 place-items-center rounded-full text-[var(--muted-foreground,#6E6558)] hover:bg-[var(--muted)] [touch-action:manipulation]")}>
      <Info aria-hidden className="size-5" />
    </button>
  );
}
