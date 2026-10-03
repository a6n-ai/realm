import type { DropOffValue } from "@/lib/catalog/drop-off";
import { cutoffMsFor, parseIsoDateUtc, zonedDateIso } from "@foundry/commons";
import { coveredDates, formatCoversLabel } from "@/lib/menu/coverage";

export type TripStatus = "upcoming" | "delivered" | "unconfirmed" | "vacation" | "rescheduled" | "combined-into" | "locked" | "cutoff-passed" | "failed";
export type TripAction = "pick" | "swap" | "move" | "address";
export type Availability = { ok: boolean; why: string | null; sub: string };
export type LegendKey = "delivered" | "upcoming" | "vacation" | "onHold";

type MealLike = { label: string; picks: { name: string }[]; quantity: number }[];

/** Structural subset of myCalendar's CalendarDay plus optional fields other work adds (cutoffAt, pooled, rescheduled, per-eating-day swaps/meals). */
export type CalendarDayInput = {
  date: string;
  deliveryId?: string;
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  locked: boolean;
  isMakeup: boolean;
  menuWeekId?: string | null;
  meal?: MealLike | null;
  options?: unknown[];
  units?: number;
  covers?: string[];
  extras?: string[];
  coversLabel?: string | null;
  combinedInto?: string | null;
  cutoffAt?: number;
  rescheduled?: boolean;
  /** Day this trip's tiffin moved to (make-up row), for the "Moved to" label. */
  movedTo?: string;
  /** Tiffins the customer moved onto this trip (null from = scheduled from the pool) and off it. */
  movesIn?: TiffinMove[];
  movesOut?: TiffinMove[];
  /** Every tiffin left this row: its date is free for a move again. */
  emptied?: boolean;
  /** This delivery's own address when re-addressed; null/absent = it follows the plan. */
  addressOverride?: { addressLine: string; postalCode: string } | null;
  /** This delivery's own drop-off when re-addressed; absent / no tag = it follows the plan. */
  dropOff?: DropOffValue;
  optimoCompletionStatus?: string | null;
  mealsByDate?: Record<string, MealLike | null | undefined>;
  appliedSwaps?: Record<string, { label: string }[]>;
};

export type TiffinMove = { from: string | null; to: string };

export type PlanContext = {
  cutoffHour: number;
  timezone: string;
  lastDeliveryDate: string | null;
  deliveryWeekdays: string[];
  eatingWeekdays?: string[] | null;
  /** This plan's first delivery date; Move never offers dates before it. */
  startDate?: string;
  active?: boolean;
  onVacation?: boolean;
  vacationsLeft?: number | null;
  frequencyKey?: string | null;
  /** False: the meal has no weekend dish, so Move can't target Sat/Sun. */
  servesWeekends?: boolean;
};

export type EatingDay = { date: string; dishSummary: string | null; swaps: string[]; locksWith: string | null };
export type Trip = {
  /** Owning plan (order publicId); empty only in single-plan legacy callers. */
  orderId: string;
  date: string;
  deliveryId: string | null;
  units: number;
  coversDates: string[];
  extraDates?: string[];
  coversLabel: string | null;
  eatingDays: EatingDay[];
  status: TripStatus;
  cutoffAt: number;
  mergedInto: string | null;
  isMakeup: boolean;
  rescheduled: boolean;
  /** Where a moved trip went: the eat day it was moved to, or the trip it combined into. */
  movedTo?: string | null;
  /** Tiffins moved onto this trip (they can't move again) and off it (their old day reads "Moved to"). */
  movesIn?: TiffinMove[];
  movesOut?: TiffinMove[];
  /** This delivery's own address when re-addressed; null = it follows the plan's address. */
  addressOverride?: { addressLine: string; postalCode: string } | null;
  /** This delivery's own drop-off when re-addressed (no tag = none there); ignored otherwise. */
  dropOff?: DropOffValue;
  /** Status reported by OptimoRoute for this delivery: "success", "failed", etc. */
  /** Status reported by OptimoRoute for this delivery: "success", "failed", etc. */
  optimoCompletionStatus?: string | null;
};
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function humanDate(iso: string): string {
  const d = parseIsoDateUtc(iso);
  return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Tue 6:00 pm" in the plan timezone. */
export function formatCutoff(ms: number, timezone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  return `${p.weekday} ${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

function summarize(meal: MealLike | null | undefined): string | null {
  const names = (meal ?? []).flatMap((c) => c.picks.map((p) => p.name));
  return names.length ? names.join(", ") : null;
}

export function buildTrips(days: CalendarDayInput[], now: number, plan: PlanContext, orderId = ""): Trip[] {
  return days
    .map((d): Trip => {
      const cutoffAt = d.cutoffAt ?? cutoffMsFor(d.date, plan.cutoffHour, plan.timezone);
      const past = d.locked || now >= cutoffAt;
      const covers = coveredDates({ deliveryDate: d.date, coversDates: d.covers ?? null });
      const rescheduled = !!d.rescheduled;
      let status: TripStatus;
      if (d.combinedInto) status = "combined-into";
      else if (d.status !== "scheduled" && rescheduled) status = "rescheduled";
      // Nobody holds a day any more: a skipped row that wasn't moved away is a failed drop.
      else if (d.status === "skipped") status = "failed";
      else if (d.status === "cancelled" || (d.status !== "scheduled" && past)) status = "locked";
      else if (d.status === "paused") status = "vacation";
      else if (d.optimoCompletionStatus === "success") status = "delivered";
      else if (d.optimoCompletionStatus === "failed") status = "failed";
      else if (!past) status = "upcoming";
      // Delivered only once OptimoRoute or an admin confirms it; until then it's awaiting confirmation.
      else status = zonedDateIso(now, plan.timezone) >= d.date ? "unconfirmed" : "cutoff-passed";
      const own = d.mealsByDate?.[d.date] ?? d.meal;
      return {
        orderId,
        date: d.date,
        deliveryId: d.deliveryId ?? null,
        addressOverride: d.addressOverride ?? null,
        dropOff: d.dropOff,
        optimoCompletionStatus: d.optimoCompletionStatus ?? null,
        units: d.units ?? 1,
        coversDates: covers,
        extraDates: d.extras ?? [],
        coversLabel: d.coversLabel ?? formatCoversLabel(covers),
        eatingDays: covers.map((c) => ({
          date: c,
          dishSummary: summarize(c === d.date ? own : d.mealsByDate?.[c]),
          swaps: (d.appliedSwaps?.[c] ?? []).map((s) => s.label),
          locksWith: c === d.date ? null : d.date,
        })),
        status,
        cutoffAt,
        mergedInto: d.combinedInto ?? null,
        isMakeup: d.isMakeup,
        rescheduled,
        movedTo: d.movedTo ?? d.combinedInto ?? null,
        movesIn: d.movesIn ?? [],
        movesOut: d.movesOut ?? [],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

const LEGEND: Record<TripStatus, LegendKey | null> = {
  upcoming: "upcoming",
  delivered: "delivered",
  unconfirmed: "upcoming",
  "cutoff-passed": "delivered",
  rescheduled: "onHold",
  locked: "onHold",
  vacation: "vacation",
  "combined-into": null,
  failed: "onHold",
};
const LEGEND_LABEL: Record<LegendKey, string> = { delivered: "Delivered", upcoming: "Upcoming", vacation: "Paused", onHold: "Not delivered" };

/** Replaces day-status.ts: legend bucket per eating day, keyed by ISO date. */
export function buildDayStatusMap(trips: Trip[]): Record<string, { status: TripStatus; legend: LegendKey | null; label: string | null }> {
  const out: Record<string, { status: TripStatus; legend: LegendKey | null; label: string | null }> = {};
  for (const t of trips) {
    const legend = LEGEND[t.status];
    for (const c of t.coversDates) out[c] = { status: t.status, legend, label: legend ? LEGEND_LABEL[legend] : null };
  }
  return out;
}

const no = (why: string): Availability => ({ ok: false, why, sub: "" });
const yes = (sub: string): Availability => ({ ok: true, why: null, sub });

export function actionAvailability(trip: Trip, _now: number, plan: PlanContext): Record<TripAction, Availability> {
  const closed = `Changes closed ${formatCutoff(trip.cutoffAt, plan.timezone)}`;
  const s = trip.status;
  const into = trip.mergedInto ? humanDate(trip.mergedInto) : "";

  const blocked = (delivered: string): string =>
    s === "combined-into" ? `Combined into ${into}. Go to that trip.`
    : s === "delivered" ? delivered
    : `${closed}. This trip is being prepared.`;

  const editable = s === "upcoming";
  // A failed drop or a legacy paused day can't be edited in place; its tiffin moves to a new day.
  const notHere = s === "failed" || s === "vacation" || s === "rescheduled";
  const pick = editable ? yes(`Closes ${formatCutoff(trip.cutoffAt, plan.timezone)}`)
    : notHere ? no("Not delivered. Move it to another day to choose meals.")
    : no(blocked(`Delivered. ${closed}.`));
  const swap = editable ? yes("Rice ↔ Roti, per eating day")
    : notHere ? no("Not delivered. Move it to another day to swap items.")
    : no(blocked(`Delivered. ${closed}.`));
  const move = editable && trip.isMakeup ? no("Already moved once. Only one move is allowed.")
    : editable ? yes("Pick a new delivery day")
    : s === "failed" ? yes("Pick a new day for this tiffin")
    : s === "vacation" ? yes("Pick a new delivery day")
    : s === "rescheduled" ? no("Already moved.")
    : no(blocked("Already delivered."));
  // Re-addressing is allowed on make-ups too (the one change they permit); never charged.
  const address: Availability = editable ? yes(`Closes ${formatCutoff(trip.cutoffAt, plan.timezone)}`)
    : no(blocked(`Delivered. ${closed}.`));

  return { pick, swap, move, address };
}
