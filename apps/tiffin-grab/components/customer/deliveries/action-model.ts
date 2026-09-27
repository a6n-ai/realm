import { actionAvailability, type Availability, type PlanContext, type Trip, type TripAction } from "@/lib/deliveries-view";

export const ACTION_LABEL: Record<TripAction, string> = {
  pick: "Edit meal",
  swap: "Swap items",
  hold: "Hold this trip",
  resume: "Resume this trip",
  move: "Move to another day",
  vacation: "Vacation",
  makeup: "Schedule a make-up",
  pool: "Schedule from pool",
  address: "Change address",
};

const CLOSED = new Set<Trip["status"]>(["delivered", "cutoff-passed", "locked", "combined-into"]);

/** Move stays available; pick needs a resolved menu, so a not-yet-released week disables it with one reason. */
const MENU_NOT_RELEASED: Availability = { ok: false, why: "Menu not released yet.", sub: "" };

/**
 * Rail + mobile bar for a trip. Swap is embedded in Edit meal (pick sheet), so
 * it is no longer a separate customer action — `canSwap` is ignored for listing.
 * `locked`: payment unconfirmed, so the plan is read-only: no actions at all.
 */
export function actionModel(trip: Trip, now: number, ctx: PlanContext, opts: { canSwap?: boolean; menuOut?: boolean; locked?: boolean; isDeliveryDay?: boolean; movedTo?: string } = {}) {
  const av = actionAvailability(trip, now, ctx);
  const held = trip.status === "hold" || trip.status === "rescheduled" || trip.status === "failed";
  // A moved-away day has nothing left to edit here: only "go to" where its tiffin is eaten now.
  const closed = CLOSED.has(trip.status) || !!opts.movedTo;
  const pickAv: Availability = opts.menuOut && !closed ? MENU_NOT_RELEASED : av.pick;
  const showAddress = opts.isDeliveryDay !== false;
  const keys: TripAction[] = closed || opts.locked
    ? []
    : ["pick", ...(held ? (["resume"] as const) : []), "move", ...(showAddress ? (["address"] as const) : []), ...(av.pool.ok ? (["pool"] as const) : [])];
  const primary: TripAction | null = opts.locked
    ? null
    : trip.status === "vacation" ? "vacation" : held ? "resume" : trip.status === "upcoming" ? "pick" : null;
  return {
    av,
    primary: opts.movedTo ? null : primary,
    rows: keys.map((key) => ({
      key,
      label: key === "vacation" ? "Resume deliveries" : ACTION_LABEL[key],
      av: key === "pick" ? pickAv : (av[key] as Availability),
    })),
    bar: (closed || opts.locked ? [] : (["pick", "move"] as TripAction[])),
    closedReason: opts.movedTo ? null : closed ? av.pick.why : null,
    goTo: opts.movedTo ?? (trip.status === "combined-into" ? trip.mergedInto : null),
  };
}

export const ACTION_SHORT: Record<TripAction, string> = {
  pick: "Edit meal",
  swap: "Swap",
  hold: "Hold",
  resume: "Resume",
  move: "Move",
  vacation: "Vacation",
  makeup: "Make-up",
  pool: "From pool",
  address: "Address",
};
