import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ClockIcon } from "lucide-react";
import { PageHeader, SectionCard, parseFilterState } from "@/components/ds";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { CRON_JOBS, nextCronRun } from "@/lib/cron/jobs";
import { CRON_RUN_FACETS } from "@/lib/cron/facets";
import { listCronRunsPage, recentCronRuns } from "@/lib/cron/run";
import { formatEpoch } from "@/lib/format/datetime";
import { RunNowButton } from "../run-now-button";
import { RunStatus, scheduleLabel } from "../run-parts";
import { RunsTable, RunsTableSkeleton } from "./runs-table";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function ScheduledJobPage({ params, searchParams }: { params: Promise<{ job: string }>; searchParams: SearchParams }) {
  await requireAdmin();
  const { job: key } = await params;
  const job = CRON_JOBS.find((j) => j.key === key);
  if (!job) notFound();
  const { timezone } = await getAppSettings();
  const last = (await recentCronRuns([job.key], 1)).get(job.key)?.[0];
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const now = Date.now();
  const next = job.cron ? nextCronRun(job.cron, now) : null;

  return (
    <div className="grid gap-6">
      <PageHeader icon={ClockIcon} title={job.name} subtitle={job.description} />
      <SectionCard title="Overview" action={job.runnable ? <RunNowButton job={job.key} inputs={job.inputs} /> : undefined}>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Schedule</dt>
            <dd>{scheduleLabel(job, timezone, now)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Next run</dt>
            <dd className="tabular-nums">{next ? formatEpoch(next, { mode: "datetime", timeZone: timezone }) : "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last run</dt>
            <dd>{last ? <RunStatus run={last} /> : <span className="text-muted-foreground">Never recorded</span>}</dd>
          </div>
        </dl>
      </SectionCard>
      <SectionCard title="Run history">
        <Suspense fallback={<RunsTableSkeleton />}>
          <RunsData job={job.key} searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function RunsData({ job, searchParams }: { job: string; searchParams: SearchParams }) {
  const { condition, page } = parseFilterState(CRON_RUN_FACETS, await searchParams);
  const result = await listCronRunsPage(job, condition, page);
  return <RunsTable rows={result.items} total={result.total} page={page.page} size={page.size} />;
}
