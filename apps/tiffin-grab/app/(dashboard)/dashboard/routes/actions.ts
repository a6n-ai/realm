"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireStaff } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { pushDay, removeStops, type PushResult, type RemoveResult } from "@/lib/services/optimoroute/push";
import { pullRoutes, type PullResult } from "@/lib/services/optimoroute/pull";
import { pullCompletions, type PullCompletionsResult } from "@/lib/services/optimoroute/completions";

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
  revalidatePath("/dashboard/routes");
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
  revalidatePath("/dashboard/routes");
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
  revalidatePath("/dashboard/routes");
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
  revalidatePath("/dashboard/routes");
  return result;
}
