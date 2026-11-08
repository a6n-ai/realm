import { withCronAuth } from "@/lib/cron/auth";

// Called by the OptimoPoller Durable Object every 30 s on Workers (cloudflare/worker.js).
// Fail-closed bearer, same contract as the other cron routes. pollOnce holds its own lease.
export const dynamic = "force-dynamic";

export const POST = withCronAuth(async () => {
  try {
    const { pollOnce } = await import("@/lib/services/optimoroute/events");
    return Response.json({ ok: true, result: await pollOnce() });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
});
