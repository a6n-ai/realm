import { cutoffMsFor, parseIsoDateUtc, zonedDateIso } from "@foundry/commons";
import { coveredDates, formatCoversLabel } from "@/lib/menu/coverage";

export type TripStatus = "upcoming" | "delivered" | "hold" | "vacation" | "rescheduled" | "combined-into" | "locked" | "cutoff-passed";
export type TripAction = "pick" | "swap" | "hold" | "resume" | "move" | "vacation" | "makeup" | "pool";
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
  pooled?: boolean;
  rescheduled?: boolean;
  /** Day this trip's tiffin moved to (make-up row), for the "Moved to" label. */
  movedTo?: string;
  mealsByDate?: Record<string, MealLike | null | undefined>;
  appliedSwaps?: Record<string, { label: string }[]>;
};

export type PlanContext = {
  cutoffHour: number;
  timezone: string;
  pooled: number;
  lastDeliveryDate: string | null;
  deliveryWeekdays: string[];
  eatingWeekdays?: string[] | null;
  active?: boolean;
  onVacation?: boolean;
  vacationsLeft?: number | null;
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
  pooled: boolean;
  rescheduled: boolean;
  /** Where a moved trip went: the eat day it was moved to, or the trip it combined into. */
  movedTo?: string | null;
  /** Another trip was merged into this one: it carries a moved tiffin, so it cannot be moved again. */
  hasMovedIn?: boolean;
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
  const movedIn = new Set(days.flatMap((d) => (d.combinedInto ? [d.combinedInto] : [])));
  return days
    .map((d): Trip => {
      const cutoffAt = d.cutoffAt ?? cutoffMsFor(d.date, plan.cutoffHour, plan.timezone);
      const past = d.locked || now >= cutoffAt;
      const covers = coveredDates({ deliveryDate: d.date, coversDates: d.covers ?? null });
      const rescheduled = !!d.rescheduled;
      let status: TripStatus;
      if (d.combinedInto) status = "combined-into";
      else if (d.status !== "scheduled" && rescheduled) status = "rescheduled";
      else if (d.status === "cancelled" || (d.status !== "scheduled" && past)) status = "locked";
      else if (d.status === "paused") status = "vacation";
      else if (d.status === "skipped") status = "hold";
      else if (!past) status = "upcoming";
      else status = zonedDateIso(now, plan.timezone) >= d.date ? "delivered" : "cutoff-passed";
      const own = d.mealsByDate?.[d.date] ?? d.meal;
      return {
        orderId,
        date: d.date,
        deliveryId: d.deliveryId ?? null,
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
        pooled: !!d.pooled,
        rescheduled,
        movedTo: d.movedTo ?? d.combinedInto ?? null,
        hasMovedIn: movedIn.has(d.date),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

const LEGEND: Record<TripStatus, LegendKey | null> = {
  upcoming: "upcoming",
  delivered: "delivered",
  "cutoff-passed": "delivered",
  hold: "onHold",
  rescheduled: "onHold",
  locked: "onHold",
  vacation: "vacation",
  "combined-into": null,
};
const LEGEND_LABEL: Record<LegendKey, string> = { delivered: "Delivered", upcoming: "Upcoming", vacation: "Vacation", onHold: "On Hold" };

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
  const vac = "On vacation. Resume deliveries first.";
  const resumeVacation = s === "vacation";

  const blocked = (delivered: string): string =>
    s === "combined-into" ? `Combined into ${into}. Go to that trip.`
    : s === "delivered" ? delivered
    : s === "vacation" ? vac
    : `${closed}. This trip is being prepared.`;

  let pick: Availability, swap: Availability, hold: Availability, resume: Availability, move: Availability;
  const editable = s === "upcoming";
  pick = editable ? yes(`Closes ${formatCutoff(trip.cutoffAt, plan.timezone)}`)
    : s === "hold" || s === "rescheduled" ? no("On hold. Resume it to choose meals.")
    : no(blocked(`Delivered. ${closed}.`));
  swap = editable ? yes("Rice ↔ Roti, per eating day")
    : s === "hold" || s === "rescheduled" ? no("On hold. Resume it to swap items.")
    : no(blocked(`Delivered. ${closed}.`));

  if (editable && trip.isMakeup) {
    hold = no("Make-up trips can't be held or moved.");
    move = no("Already moved once. Only one move is allowed.");
  } else {
    hold = editable ? yes("Adds 1 hold day back to your plan")
      : s === "hold" || s === "rescheduled" ? no("Already on hold. Resume it instead.")
      : no(blocked("Already delivered."));
    move = editable && trip.hasMovedIn ? no("This trip already carries a moved tiffin. Only one move is allowed.")
      : editable ? yes("Pick a new delivery day")
      : s === "hold" && trip.pooled ? yes(plan.lastDeliveryDate ? `Only days after ${humanDate(plan.lastDeliveryDate)}` : "Only days after your last delivery")
      : s === "hold" ? yes("Uses one of your hold days")
      : resumeVacation ? yes("Uses one of your hold days")
      : s === "rescheduled" ? no("Already moved.")
      : no(blocked("Already delivered."));
  }

  resume = s === "hold" && !trip.pooled ? yes("Put it back on the schedule. The hold day is returned.")
    : s === "hold" ? no("This hold is in your pool. Schedule it on a day instead.")
    : s === "rescheduled" ? no("Already moved.")
    : s === "upcoming" ? no("This trip isn't on hold.")
    : no(blocked("Already delivered."));

  const vacation: Availability = plan.active === false ? no("No plan running.")
    : plan.onVacation ? yes("Resume deliveries")
    : plan.vacationsLeft === 0 ? no("You've used all your vacation stretches")
    : yes("Start today or any day after");

  const n = plan.pooled;
  const wd = plan.deliveryWeekdays.map((w) => w[0]!.toUpperCase() + w.slice(1, 3)).join(", ");
  const makeup: Availability = n >= 1
    ? yes(`${n} ${n === 1 ? "tiffin" : "tiffins"} waiting. Pick a day after ${plan.lastDeliveryDate ? humanDate(plan.lastDeliveryDate) : "your last delivery"} (${wd}).`)
    : no("No tiffins waiting in your pool.");

  const pool: Availability = (s === "hold" && trip.pooled) || (s === "locked" && !trip.isMakeup)
    ? yes("In your pool. Schedule it on a day.")
    : no("Nothing from this trip is in your pool.");

  return { pick, swap, hold, resume, move, vacation, makeup, pool };
}
