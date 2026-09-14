"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { pushDay, removeStops, type PushResult, type RemoveResult } from "@/lib/services/optimoroute/push";
import { pullRoutes, type PullResult } from "@/lib/services/optimoroute/pull";
import { pullCompletions, type PullCompletionsResult } from "@/lib/services/optimoroute/completions";
import { assignDriver, listKnownDrivers, type KnownDriver } from "@/lib/services/optimoroute/drivers";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Sends the day's stops to OptimoRoute. Staff-only and idempotent — re-running after a
 * partial failure re-sends everything, which OptimoRoute treats as a no-op for stops that
 * already match.
 */
export async function pushDayAction(date: string): Promise<PushResult> {
  await requireStaff();
  if (!ISO_DATE.test(date)) throw new ValidationError("A YYYY-MM-DD date is required");

  const result = await pushDay(date, await currentUserId());
  revalidatePath("/dashboard/dispatch");
  return result;
}

/**
 * Removes stops from OptimoRoute. Destructive, so the caller must name the exact stops —
 * there is no "remove everything stale" call. removeStops re-checks staleness against a
 * fresh read before deleting anything, so a stop that went live again is skipped.
 */
export async function removeStopsAction(date: string, orderNos: string[]): Promise<RemoveResult> {
  await requireStaff();
  if (!ISO_DATE.test(date)) throw new ValidationError("A YYYY-MM-DD date is required");
  if (orderNos.length === 0) throw new ValidationError("Select at least one stop to remove");

  const result = await removeStops(date, orderNos, await currentUserId());
  revalidatePath("/dashboard/dispatch");
  return result;
}

/**
 * Reads OptimoRoute's planned routes back onto our deliveries. Safe to re-run: it
 * overwrites assignments and clears any that no longer appear on a route.
 */
export async function pullRoutesAction(date: string): Promise<PullResult> {
  await requireStaff();
  if (!ISO_DATE.test(date)) throw new ValidationError("A YYYY-MM-DD date is required");

  const result = await pullRoutes(date);
  revalidatePath("/dashboard/dispatch");
  // Labels print in driver-then-stop order, so they change the moment routes land.
  revalidatePath("/dashboard/labels");
  return result;
}

/**
 * Reads OptimoRoute's proof-of-delivery status back for the date. A "success" stop only
 * records confirmation; a "failed" stop calls the same skipDelivery() a dispatcher would use
 * by hand, pooling the tiffin. Safe to re-run — matching and the skip itself are idempotent.
 */
export async function pullCompletionsAction(date: string): Promise<PullCompletionsResult> {
  await requireStaff();
  if (!ISO_DATE.test(date)) throw new ValidationError("A YYYY-MM-DD date is required");

  const result = await pullCompletions(date, await currentUserId());
  revalidatePath("/dashboard/dispatch");
  return result;
}

/**
 * Lists drivers seen on past OptimoRoute routes, for the reassignment picklist.
 */
export async function listDriversAction(): Promise<KnownDriver[]> {
  await requireStaff();
  return listKnownDrivers();
}

/**
 * Reassigns a stop to a different driver. assignDriver throws if the order has
 * no planned delivery for that date, so the failure surfaces to the caller
 * instead of the dashboard's usual thrown-error handling.
 */
export async function reassignDriverAction(
  orderNo: string,
  date: string,
  driverSerial: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  await requireStaff();
  if (!ISO_DATE.test(date)) throw new ValidationError("A YYYY-MM-DD date is required");

  try {
    await assignDriver(orderNo, date, driverSerial, await currentUserId());
    try {
      // Best-effort: the assignment already succeeded on OptimoRoute, so a pull
      // failure here just means the dashboard shows stale driver fields until
      // the next pull — not a reason to report the reassignment as failed.
      await pullRoutes(date);
    } catch (e) {
      console.error("pullRoutes after reassignDriver failed", e);
    }
    revalidatePath("/dashboard/dispatch");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Unknown error" };
  }
}
