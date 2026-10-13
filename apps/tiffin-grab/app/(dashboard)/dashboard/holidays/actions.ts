"use server";

import { revalidatePath } from "next/cache";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { humanDate } from "@/lib/deliveries-view";
import { createHoliday, placeHolidayDay, reapplyHoliday, removeHoliday, renameHoliday, type HolidayPreview, type HolidayRun } from "@/lib/services/holidays.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { currentUserId } from "@/lib/services/session-service";

// The permission is checked here; which organizations the caller may touch is enforced again inside the service.
async function writer() {
  await requirePermission({ holiday: ["write"] });
  return resolveSessionVisibleOrgIds(await getSession());
}

const plural = (n: number) => `${n} ${n === 1 ? "delivery" : "deliveries"}`;
const and = (items: string[]) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : (items[0] ?? ""));

function runLine(lead: string, run: HolidayRun): string {
  const parts = [`${lead} ${plural(run.closed)} closed, ${run.closed - run.needsPlacing} added back at the end of the plan.`];
  if (run.needsPlacing > 0) parts.push(`${run.needsPlacing} waiting under Needs placing.`);
  if (run.removedFromRoute > 0) parts.push(`${run.removedFromRoute} removed from today's route.`);
  if (run.failed.length > 0) parts.push(`Could not close: ${run.failed.join(", ")}. Re-apply to retry.`);
  return parts.join(" ");
}

async function refreshing<T extends ActionResult<Record<string, unknown>>>(res: T): Promise<T> {
  if ("ok" in res) revalidatePath("/dashboard/holidays");
  return res;
}

export async function createHolidayAction(
  input: { organizationId: string; date: string; name: string; notify: boolean; confirmToday?: boolean },
): Promise<ActionResult<{ preview?: HolidayPreview }>> {
  return refreshing(await runAction(async (): Promise<{ message?: string; preview?: HolidayPreview }> => {
    const visible = await writer();
    const out = await createHoliday({ ...input, confirmToday: input.confirmToday ?? false }, await currentUserId(), visible);
    return out.created ? { message: runLine("Holiday saved.", out) } : { preview: out.preview };
  }));
}

export async function reapplyHolidayAction(publicId: string): Promise<ActionResult> {
  return refreshing(await runAction(async () => {
    const visible = await writer();
    return runLine("Re-applied.", await reapplyHoliday(publicId, await currentUserId(), visible));
  }));
}

export async function renameHolidayAction(publicId: string, name: string): Promise<ActionResult> {
  return refreshing(await runAction(async () => {
    const visible = await writer();
    await renameHoliday(publicId, name, await currentUserId(), visible);
    return "Holiday renamed";
  }));
}

export async function removeHolidayAction(publicId: string): Promise<ActionResult<{ removed: boolean }>> {
  return refreshing(await runAction(async () => {
    const visible = await writer();
    const { restored, left, failed, removed, stillOwed } = await removeHoliday(publicId, await currentUserId(), visible);
    const kept = left > 0 ? `, left ${left} with their extra day in place (already changed, or past cutoff)` : "";
    const owed = stillOwed > 0 ? `${stillOwed} ${stillOwed === 1 ? "day" : "days"} still need placing; place them, then remove again.` : "";
    const why = failed.length > 0 ? `Could not undo: ${failed.join(", ")}.${owed ? ` ${owed}` : ""}` : owed || (removed ? "" : "A delivery was closed for it while removing.");
    const tail = removed ? "" : ` ${why}${stillOwed > 0 && failed.length === 0 ? "" : " Remove again to finish."}`;
    return { removed, message: `${removed ? "Holiday removed." : "Holiday kept for now."} Restored ${plural(restored)}${kept}.${tail}` };
  }));
}

export async function placeHolidayDayAction(deliveryPublicId: string, fromDate: string): Promise<ActionResult> {
  return refreshing(await runAction(async () => {
    const visible = await writer();
    const dates = await placeHolidayDay(deliveryPublicId, fromDate, await currentUserId(), visible);
    return `Placed on ${and(dates.map(humanDate))}.`;
  }));
}
