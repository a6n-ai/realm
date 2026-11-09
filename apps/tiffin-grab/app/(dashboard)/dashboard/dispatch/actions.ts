"use server";

import { parseIsoDate } from "@/lib/dates/iso-date";
import { revalidatePath } from "next/cache";
import { AppError, ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { requireStaff } from "@/lib/auth/guards";
import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { currentUserId } from "@/lib/services/session-service";
import {
  pushDay,
  removeStops,
  pushOneDelivery,
  removeOneDelivery,
  getDeliveryActivities,
  type PushResult,
  type RemoveResult,
  type DeliveryActivity,
} from "@/lib/services/optimoroute/push";
import { pullRoutes, type PullResult } from "@/lib/services/optimoroute/pull";
import { pullCompletions, type PullCompletionsResult } from "@/lib/services/optimoroute/completions";
import { assignDriver } from "@/lib/services/optimoroute/drivers";

const log = createLogger("dispatch.actions");

type RevalidateTarget = [path: string] | [path: string, type: "layout"];

/**
 * Staff, valid date, do the work, optionally pull routes back (best effort: the work already
 * succeeded on OptimoRoute, so a failed pull only leaves stale driver fields until the next
 * pull and is logged, never reported as a failure), then revalidate. A failure comes back
 * as `{ error }` carrying the real message.
 */
async function dispatchAction<T extends Record<string, unknown>>(
  date: string,
  run: (actorId: bigint | null) => Promise<T>,
  { pull = false, revalidate }: { pull?: boolean; revalidate: RevalidateTarget[] },
): Promise<ActionResult<T>> {
  const res = await runAction(async () => {
    await requireStaff();
    if (parseIsoDate(date) == null) throw new ValidationError("A YYYY-MM-DD date is required");
    let out: T;
    try {
      out = await run(await currentUserId());
    } catch (e) {
      throw e instanceof AppError ? e : new ValidationError(e instanceof Error ? e.message : "Unknown error");
    }
    if (pull) {
      try {
        await pullRoutes(date);
      } catch (e) {
        log.error({ err: e, date }, "pullRoutes after dispatch action failed");
      }
    }
    return out;
  });
  if ("ok" in res) for (const target of revalidate) revalidatePath(target[0], target[1]);
  return res;
}

/**
 * Sends the day's stops to OptimoRoute. Staff-only and idempotent — re-running after a
 * partial failure re-sends everything, which OptimoRoute treats as a no-op for stops that
 * already match.
 */
export async function pushDayAction(date: string): Promise<ActionResult<PushResult>> {
  return dispatchAction(date, (actor) => pushDay(date, actor), {
    // The Overview's route-push tile and the header badge read the same push status.
    revalidate: [["/dashboard/dispatch"], ["/dashboard", "layout"]],
  });
}

/**
 * Pushes only the named deliveries — the Dispatch rows with no driver yet — then pulls so
 * any that OptimoRoute already routed show their driver.
 */
export async function pushUnassignedAction(date: string, orderNos: string[]): Promise<ActionResult<PushResult>> {
  return dispatchAction(
    date,
    (actor) => {
      if (orderNos.length === 0) throw new ValidationError("No unassigned deliveries to push");
      return pushDay(date, actor, orderNos);
    },
    { pull: true, revalidate: [["/dashboard/dispatch"]] },
  );
}

/**
 * Removes stops from OptimoRoute. Destructive, so the caller must name the exact stops —
 * there is no "remove everything stale" call. removeStops re-checks staleness against a
 * fresh read before deleting anything, so a stop that went live again is skipped.
 */
export async function removeStopsAction(date: string, orderNos: string[]): Promise<ActionResult<RemoveResult>> {
  return dispatchAction(
    date,
    (actor) => {
      if (orderNos.length === 0) throw new ValidationError("Select at least one stop to remove");
      return removeStops(date, orderNos, actor);
    },
    { revalidate: [["/dashboard/dispatch"]] },
  );
}

/**
 * Reads OptimoRoute's planned routes back onto our deliveries. Safe to re-run: it
 * overwrites assignments and clears any that no longer appear on a route.
 */
export async function pullRoutesAction(date: string): Promise<ActionResult<PullResult>> {
  return dispatchAction(date, () => pullRoutes(date), {
    // Labels print in driver-then-stop order, so they change the moment routes land.
    revalidate: [["/dashboard/dispatch"], ["/dashboard/labels"]],
  });
}

/**
 * Reads OptimoRoute's proof-of-delivery status back for the date. A "success" stop only
 * records confirmation; a "failed" stop calls the same skipDelivery() a dispatcher would use
 * by hand, pooling the tiffin. Safe to re-run — matching and the skip itself are idempotent.
 */
export async function pullCompletionsAction(date: string): Promise<ActionResult<PullCompletionsResult>> {
  return dispatchAction(date, (actor) => pullCompletions(date, actor), {
    revalidate: [["/dashboard/dispatch"], ["/dashboard/orders"], ["/me", "layout"]],
  });
}

/** Reassigns a stop to a different driver; assignDriver throws if the order has no planned delivery for that date. */
export async function reassignDriverAction(orderNo: string, date: string, driverSerial: string): Promise<ActionResult> {
  return dispatchAction(
    date,
    async (actor): Promise<Record<string, never>> => {
      await assignDriver(orderNo, date, driverSerial, actor);
      return {};
    },
    { pull: true, revalidate: [["/dashboard/dispatch"]] },
  );
}

/** Manual "redo the push" for one delivery, from the Dispatch table's own row actions. */
export async function pushDeliveryAction(orderNo: string, date: string): Promise<ActionResult> {
  return dispatchAction(
    date,
    async (actor): Promise<Record<string, never>> => {
      await pushOneDelivery(orderNo, date, actor);
      return {};
    },
    { pull: true, revalidate: [["/dashboard/dispatch"]] },
  );
}

/** Read-only push/pull activity log for one delivery — the Dispatch row-click history drawer. */
export async function getDeliveryActivitiesAction(orderNo: string): Promise<DeliveryActivity[]> {
  await requireStaff();
  return getDeliveryActivities(orderNo);
}

/** Manual per-row removal from the Dispatch table — force-removes regardless of the day-level stale check. */
export async function removeDeliveryAction(orderNo: string, date: string): Promise<ActionResult> {
  return dispatchAction(
    date,
    async (actor): Promise<Record<string, never>> => {
      await removeOneDelivery(orderNo, date, actor);
      return {};
    },
    { pull: true, revalidate: [["/dashboard/dispatch"]] },
  );
}
