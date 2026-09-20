import { actionAvailability, type Availability, type PlanContext, type Trip, type TripAction } from "@/lib/deliveries-view";

export const ACTION_LABEL: Record<TripAction, string> = {
  pick: "Pick meals",
  swap: "Swap items",
  hold: "Hold this trip",
  resume: "Resume this trip",
  move: "Move to another day",
  vacation: "Vacation",
  makeup: "Schedule a make-up",
  pool: "Schedule from pool",
};

const CLOSED = new Set<Trip["status"]>(["delivered", "cutoff-passed", "locked", "combined-into"]);

/** One place that decides what the rail and the mobile bar show for a trip. */
export function actionModel(trip: Trip, now: number, ctx: PlanContext) {
  const av = actionAvailability(trip, now, ctx);
  const held = trip.status === "hold" || trip.status === "rescheduled";
  const closed = CLOSED.has(trip.status);
  const keys: TripAction[] = closed ? [] : ["pick", "swap", held ? "resume" : "hold", "move", ...(av.pool.ok ? (["pool"] as const) : [])];
  const primary: TripAction | null = trip.status === "vacation" ? "vacation" : held ? "resume" : trip.status === "upcoming" ? "pick" : null;
  return {
    av,
    primary,
    rows: keys.map((key) => ({ key, label: key === "vacation" ? "Resume deliveries" : ACTION_LABEL[key], av: av[key] as Availability })),
    bar: (closed ? [] : (["swap", ...(held ? [] : ["hold"]), "move"] as TripAction[])),
    closedReason: closed ? av.pick.why : null,
    goTo: trip.status === "combined-into" ? trip.mergedInto : null,
  };
}
