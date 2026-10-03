import { actionAvailability, type Availability, type PlanContext, type Trip, type TripAction } from "@/lib/deliveries-view";

export const ACTION_LABEL: Record<TripAction, string> = {
  pick: "Edit meal",
  swap: "Swap items",
  move: "Move to another day",
  address: "Change address",
};

const CLOSED = new Set<Trip["status"]>(["delivered", "unconfirmed", "cutoff-passed", "locked", "combined-into", "rescheduled"]);

/** Move stays available; pick needs a resolved menu, so a not-yet-released week disables it with one reason. */
const MENU_NOT_RELEASED: Availability = { ok: false, why: "Menu not released yet.", sub: "" };

/**
 * Rail + mobile bar for a trip. Swap is embedded in Edit meal (pick sheet), so
 * it is no longer a separate customer action — `canSwap` is ignored for listing.
 * `locked`: payment unconfirmed, so the plan is read-only: no actions at all.
 */
export function actionModel(trip: Trip, now: number, ctx: PlanContext, opts: { canSwap?: boolean; menuOut?: boolean; locked?: boolean; isDeliveryDay?: boolean; movedTo?: string; trial?: boolean } = {}) {
  const av = actionAvailability(trip, now, ctx);
  // Not delivered (a failed drop, or a legacy paused day): the only thing to do is move it.
  const moveOnly = trip.status === "failed" || trip.status === "vacation";
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
  const primary: TripAction | null = opts.locked || closed || movedAway ? null
    : moveOnly ? (opts.trial ? null : "move") : trip.status === "upcoming" ? "pick" : null;
  return {
    av,
    primary,
    rows: keys.map((key) => ({
      key,
      label: ACTION_LABEL[key],
      av: key === "pick" ? pickAv : (av[key] as Availability),
    })),
    bar: (closed || opts.locked ? [] : movedAway ? (showAddress ? ["address"] : []) : moveOnly ? (opts.trial ? [] : ["move"]) : opts.trial ? ["pick"] : ["pick", "move"]) as TripAction[],
    closedReason: movedAway ? null : closed ? av.pick.why : null,
    goTo: opts.movedTo ?? (trip.status === "combined-into" ? trip.mergedInto : trip.status === "rescheduled" ? (trip.movedTo ?? null) : null),
  };
}

export const ACTION_SHORT: Record<TripAction, string> = {
  pick: "Edit meal",
  swap: "Swap",
  move: "Move",
  address: "Address",
};
