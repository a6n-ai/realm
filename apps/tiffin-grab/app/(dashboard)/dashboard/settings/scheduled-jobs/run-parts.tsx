import { Badge } from "@foundry/ui/badge";
import { describeCron, type CronJob } from "@/lib/cron/jobs";

export function scheduleLabel(job: CronJob, timezone: string, now: number): string {
  if (!job.cron) return job.runnable ? "Manual only" : "Not scheduled";
  return describeCron(job.cron, timezone, now);
}

export function RunStatus({ run }: { run: { finishedAt: number | null; ok: boolean | null } }) {
  if (run.finishedAt == null) return <Badge variant="outline">Running</Badge>;
  return run.ok ? (
    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">OK</Badge>
  ) : (
    <Badge variant="destructive">Failed</Badge>
  );
}
