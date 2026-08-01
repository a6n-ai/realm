"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { pushDay, type PushResult } from "@/lib/services/optimoroute/push";
import { pullRoutes, type PullResult } from "@/lib/services/optimoroute/pull";

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
