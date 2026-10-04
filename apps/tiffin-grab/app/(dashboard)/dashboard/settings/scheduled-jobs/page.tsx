import Link from "next/link";
import { ChevronRightIcon, ClockIcon } from "lucide-react";
import { PageHeader } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { CRON_JOBS } from "@/lib/cron/jobs";
import { recentCronRuns } from "@/lib/cron/run";
import { formatEpoch } from "@/lib/format/datetime";
import { RunStatus, scheduleLabel } from "./run-parts";

export default async function ScheduledJobsPage() {
  await requireAdmin();
  const { timezone } = await getAppSettings();
  const runs = await recentCronRuns(CRON_JOBS.map((j) => j.key), 1);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();

  return (
    <div className="grid gap-6">
      <PageHeader icon={ClockIcon} title="Scheduled jobs" subtitle="What runs on its own or by hand. Open a job to run it and see its history." />
      <ul className="bg-card divide-y rounded-xl border">
        {CRON_JOBS.map((job) => {
          const last = runs.get(job.key)?.[0];
          return (
            <li key={job.key}>
              <Link
                href={`/dashboard/settings/scheduled-jobs/${job.key}`}
                className="hover:bg-muted/50 flex items-center gap-4 px-4 py-3 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{job.name}</p>
                  <p className="text-muted-foreground text-sm">{scheduleLabel(job, timezone, now)}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {last ? (
                    <>
                      <span className="text-muted-foreground hidden tabular-nums sm:inline">
                        {formatEpoch(last.startedAt, { mode: "datetime", timeZone: timezone })}
                      </span>
                      <RunStatus run={last} />
                    </>
                  ) : (
                    <span className="text-muted-foreground">Never run</span>
                  )}
                </div>
                <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
