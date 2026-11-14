import { withCronAuth } from "@/lib/cron/auth";
import type { CronJobKey } from "@/lib/cron/jobs";
import { runCronJob, type RunInput } from "@/lib/cron/run";

/** GET and POST behind the fail-closed CRON_SECRET bearer. Route files still declare `dynamic` themselves: Next needs the literal in the file. */
export function cronRoutes(handler: (request: Request) => Promise<Response>) {
  const handle = withCronAuth(handler);
  return { GET: handle, POST: handle };
}

/** A route that runs one registered job through runCronJob (cron_runs row, same locking and error handling). */
export function cronJobRoute(
  job: CronJobKey,
  opts: { input?: (request: Request) => RunInput; shape?: (result: Awaited<ReturnType<typeof runCronJob>>) => unknown } = {},
) {
  return cronRoutes(async (request) => {
    const result = opts.input ? await runCronJob(job, "schedule", null, opts.input(request)) : await runCronJob(job, "schedule");
    return Response.json(opts.shape ? opts.shape(result) : result, { status: result.ok ? 200 : 500 });
  });
}
