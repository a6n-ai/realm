import { actionAvailability, type Availability, type PlanContext, type Trip, type TripAction } from "@/lib/deliveries-view";

export const RESUME_DAY_LABEL = "Resume this day";
export const RESUME_ALL_LABEL = "Resume all";
export const MOVE_DAY_LABEL = "Move";
export const PAUSE_DAY_LABEL = "Pause this day";

export const ACTION_LABEL: Record<TripAction, string> = {
  pick: "Edit meal",
  swap: "Swap items",
  move: "Move to another day",
  address: "Change address",
};

const CLOSED = new Set<Trip["status"]>(["delivered", "unconfirmed", "cutoff-passed", "locked", "combined-into", "rescheduled", "holiday"]);

/** Move stays available; pick needs a resolved menu, so a not-yet-released week disables it with one reason. */
const MENU_NOT_RELEASED: Availability = { ok: false, why: "Menu not released yet.", sub: "" };

/**
 * Rail + mobile bar for a trip. Swap is embedded in Edit meal (pick sheet), so
 * it is no longer a separate customer action — `canSwap` is ignored for listing.
 * `locked`: payment unconfirmed, so the plan is read-only: no actions at all.
 */
export function actionModel(trip: Trip, now: number, ctx: PlanContext, opts: { canSwap?: boolean; menuOut?: boolean; locked?: boolean; isDeliveryDay?: boolean; movedTo?: string; trial?: boolean; pausedAhead?: number } = {}) {
  const av = actionAvailability(trip, now, ctx);
  // Not delivered (a failed drop, a hold, or a paused day past its cutoff): the only thing to do is move it.
  const moveOnly = trip.status === "failed" || trip.status === "paused";
  // A moved-away eating day has nothing to edit here except its truck's address (the delivery
  // day never moves), plus "go to" where its tiffin is eaten now.
  const movedAway = !!opts.movedTo;
  const closed = CLOSED.has(trip.status);
  const pickAv: Availability = opts.menuOut && !closed ? MENU_NOT_RELEASED : av.pick;
  const showAddress = opts.isDeliveryDay !== false;
  const keys: TripAction[] = closed || opts.locked ? []
    : movedAway ? (showAddress ? ["address"] : [])
    : moveOnly ? (opts.trial ? [] : ["move"])
    : opts.trial ? ["pick", ...(showAddress ? (["address"] as const) : [])]
    : ["pick", "move", ...(showAddress ? (["address"] as const) : [])];
  // A paused day's one primary is Resume; Move sits beside it.
  const canResume = trip.status === "paused" && !closed && !opts.locked && !movedAway;
  const primary: TripAction | null = opts.locked || closed || movedAway || canResume ? null
    : moveOnly ? (opts.trial ? null : "move") : trip.status === "upcoming" ? "pick" : null;
  // Same rules the server applies to one day: still open, an original delivery, nothing moved onto it.
  const canPause = trip.status === "upcoming" && !opts.locked && !movedAway && !opts.trial && !trip.isMakeup && (trip.movesIn?.length ?? 0) === 0;
  // A paused day (still before cutoff) goes back on the same date; Move stays its own action.
  // A hold, a lapsed pause and a failed drop only move.
  return {
    av,
    primary,
    resume: { day: canResume, all: canResume && (opts.pausedAhead ?? 0) > 1 },
    pause: canPause,
    rows: keys.map((key) => ({
      key,
      label: ACTION_LABEL[key],
      av: key === "pick" ? pickAv : (av[key] as Availability),
    })),
    bar: (closed || opts.locked ? [] : movedAway ? (showAddress ? ["address"] : []) : moveOnly ? (opts.trial ? [] : ["move"]) : opts.trial ? ["pick"] : ["pick", "move"]) as TripAction[],
    closedReason: movedAway ? null : closed ? av.pick.why : null,
    goTo: opts.movedTo ?? (trip.status === "combined-into" ? trip.mergedInto : trip.status === "rescheduled" || trip.status === "holiday" ? (trip.movedTo ?? null) : null),
  };
}

export const ACTION_SHORT: Record<TripAction, string> = {
  pick: "Edit meal",
  swap: "Swap",
  move: "Move",
  address: "Address",
};
