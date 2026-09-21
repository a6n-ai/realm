"use client";
import { Info, Truck } from "lucide-react";
import { Card, Sheet, StatusDot, type DeliveryStatus, type Tone } from "@/components/customer/kit";
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

/** One eating day of the selected week: date + dishes; a truck marks the delivery day, the "i" button (beside the row) holds the rest. */
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
        <span className="flex items-center gap-2 text-[15px] font-semibold">
          {humanDate(row.date)}
        </span>
        <span className={cn(HELP, "block truncate")}>{dish || "Default menu"}</span>
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
      <p className={cn(HELP, "mt-4 flex items-center gap-1.5")} data-testid="delivery-block">
        <Truck aria-hidden className="size-4 shrink-0" />
        {deliveryLine(row)} · {tiffins(trip.units)} covering {covers}
        {cutoff ? ` · ${cutoff}` : ""}
      </p>
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
};

/** Plain-words breakdown of one trip: what the status means, what arrives, when it locks. */
export function TripInfoSheet({ row, tz, plan, open, onClose }: { row: EatingRow; tz: string; plan?: PlanTagInfo; open: boolean; onClose: () => void }) {
  const t = row.trip;
  const m = statusMeta(t);
  const facts: [string, string][] = [
    ["Status", m.label],
    ["Delivery day", humanDate(t.date)],
    ["Feeds", `${t.coversDates.map((c) => humanDate(c)).join(", ")} (${tiffins(t.units)})`],
    ["Changes close", t.status === "upcoming" ? formatCutoff(t.cutoffAt, tz) : `Closed ${formatCutoff(t.cutoffAt, tz)}`],
  ];
  if (plan) facts.unshift(["Plan", plan.label]);
  if (t.isMakeup) facts.push(["Type", "Make-up delivery, added after your plan's last day"]);
  if (t.pooled) facts.push(["Pool", "This tiffin is in your pool. Schedule it on a day."]);
  return (
    <Sheet open={open} onClose={onClose} title={`${humanDate(row.date)} · trip details`}>
      <div className="space-y-4 pb-2 text-[15px]">
        <p>{EXPLAIN[t.status]}</p>
        <dl className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {facts.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
              <dt className="text-[var(--muted-foreground,#6E6558)]">{k}</dt>
              <dd className="text-right font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <section aria-label="Meals">
          <h3 className="mb-2 text-sm font-semibold">Meals on this trip</h3>
          <ul className="space-y-2">
            {t.eatingDays.map((e) => (
              <li key={e.date}>
                <span className="block text-[13px] font-semibold text-[var(--muted-foreground,#6E6558)]">{humanDate(e.date)}</span>
                {dedupeDishes(e.dishSummary).join(", ") || "Default menu"}
                {e.swaps.length > 0 && <span className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">Swapped: {e.swaps.join(", ")}</span>}
              </li>
            ))}
          </ul>
        </section>
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
