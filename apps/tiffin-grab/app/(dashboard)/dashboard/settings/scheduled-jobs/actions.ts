"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { isRunnable, runCronJob } from "@/lib/cron/run";
import { runAction } from "@/app/(customer)/me/action-result";

export async function runCronJobAction(job: string, input: { date?: string; mode?: string } = {}) {
  return runAction(async () => {
    await requireAdmin();
    if (!isRunnable(job)) throw new ValidationError("This job can't be run from here");
    const date = input.date || undefined;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError("Pick a valid date");
    const mode = input.mode === "pull" ? "pull" : input.mode === "push" ? "push" : undefined;
    const result = await runCronJob(job, "manual", await currentUserId(), { date, mode });
    revalidatePath("/dashboard/settings/scheduled-jobs", "layout");
    if (!result.ok) throw new ValidationError(result.error);
    return "Job finished";
  });
}
