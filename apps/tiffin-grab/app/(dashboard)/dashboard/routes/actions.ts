"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { pushDay, type PushResult } from "@/lib/services/optimoroute/push";

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
