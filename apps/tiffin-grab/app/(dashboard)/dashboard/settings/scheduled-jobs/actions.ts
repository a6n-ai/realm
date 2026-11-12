"use server";
import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { currentUserId } from "@/lib/services/session-service";
import { isRunnable, runCronJob } from "@/lib/cron/run";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";

export async function runCronJobAction(job: string, input: { date?: string; mode?: string } = {}): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: [["/dashboard/settings/scheduled-jobs", "layout"]] }, async () => {
    if (!isRunnable(job)) throw new ValidationError("This job can't be run from here");
    const date = input.date || undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError("Pick a valid date");
    const mode = input.mode === "pull" ? "pull" : input.mode === "push" ? "push" : undefined;
    const result = await runCronJob(job, "manual", await currentUserId(), { date, mode });
    if (!result.ok) {
      // A failed run is still recorded in the history table, and staffAction only refreshes on success.
      revalidatePath("/dashboard/settings/scheduled-jobs", "layout");
      throw new ValidationError(result.error);
    }
    return "Job finished";
  });
}
