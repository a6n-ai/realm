import { cronJobRoute } from "@/lib/cron/route";

// Called by the OptimoPoller Durable Object every 30 s on Workers (cloudflare/worker.js).
// Fail-closed bearer, recorded in cron_runs via runCronJob. pollOnce holds its own lease.
export const dynamic = "force-dynamic";

export const { POST } = cronJobRoute("optimo-events", {
  shape: (r) => (r.ok ? { ok: true, result: r.summary } : r),
});
