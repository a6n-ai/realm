import { ClockIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { PageHeader, SectionCard } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { CRON_JOBS, describeCron, nextCronRun } from "@/lib/cron/jobs";
import { recentCronRuns, type CronRunRow } from "@/lib/cron/run";
import { formatEpoch } from "@/lib/format/datetime";
import { RunNowButton } from "./run-now-button";

const label = (k: string) => k.replace(/([A-Z])/g, " $1").toLowerCase();

function RunStatus({ run }: { run: CronRunRow }) {
  if (run.finishedAt == null) return <Badge variant="outline">Running</Badge>;
  return run.ok ? <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400">OK</Badge> : <Badge variant="destructive">Failed</Badge>;
}

function RunLine({ run, tz }: { run: CronRunRow; tz: string }) {
  const summary = Object.entries(run.summary ?? {}).filter(([k]) => k !== "date");
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
      <RunStatus run={run} />
      <span className="tabular-nums">{formatEpoch(run.startedAt, { mode: "datetime", timeZone: tz })}</span>
      <span className="text-muted-foreground">{run.trigger === "manual" ? "Run now" : "Scheduled"}</span>
      {run.ok === false && run.error ? <span className="text-destructive">{run.error}</span> : null}
      {summary.length > 0 && (
        <span className="text-muted-foreground tabular-nums">
          {summary.map(([k, v]) => `${label(k)} ${v}`).join(" · ")}
        </span>
      )}
    </li>
  );
}

export default async function ScheduledJobsPage() {
  await requireAdmin();
  const { timezone } = await getAppSettings();
  const runs = await recentCronRuns(CRON_JOBS.map((j) => j.key));
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();

  return (
    <div className="grid gap-6">
      <PageHeader icon={ClockIcon} title="Scheduled jobs" subtitle="What runs on its own, when it last ran, and when it runs next." />
      {CRON_JOBS.map((job) => {
        const history = runs.get(job.key) ?? [];
        const next = job.cron ? nextCronRun(job.cron, now) : null;
        return (
          <SectionCard
            key={job.key}
            title={job.name}
            subtitle={job.description}
            action={job.runnable ? <RunNowButton job={job.key} /> : undefined}
          >
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Schedule</dt>
                <dd>{describeCron(job.cron, timezone, now)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Next run</dt>
                <dd className="tabular-nums">{next ? formatEpoch(next, { mode: "datetime", timeZone: timezone }) : "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Last run</dt>
                <dd>{history[0] ? <RunStatus run={history[0]} /> : <span className="text-muted-foreground">Never recorded</span>}</dd>
              </div>
            </dl>
            {history.length > 0 && (
              <ul className="mt-3 divide-y border-t">
                {history.map((r) => <RunLine key={r.publicId} run={r} tz={timezone} />)}
              </ul>
            )}
          </SectionCard>
        );
      })}
    </div>
  );
}
