"use server";

import { revalidatePath } from "next/cache";
import { ValidationError } from "@foundry/commons";
import { requireAdmin } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { isRunnable, runCronJob } from "@/lib/cron/run";
import { runAction } from "@/app/(customer)/me/action-result";

export async function runCronJobAction(job: string) {
  return runAction(async () => {
    await requireAdmin();
    if (!isRunnable(job)) throw new ValidationError("This job can't be run from here");
    const result = await runCronJob(job, "manual", await currentUserId());
    revalidatePath("/dashboard/settings/scheduled-jobs");
    if (!result.ok) throw new ValidationError(result.error);
    return "Job finished";
  });
}
