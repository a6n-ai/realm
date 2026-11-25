import { withCronAuth } from "@/lib/cron/auth";
import { resolveAudiencePage } from "@/lib/relay/audience";

export const dynamic = "force-dynamic";

// Called only by the RelayAudience entrypoint (cloudflare/worker.js) over WORKER_SELF_REFERENCE.
export const POST = withCronAuth(async (request) => {
  const body = (await request.json().catch(() => null)) as { audience?: unknown; cursor?: unknown; limit?: unknown } | null;
  if (!body) return Response.json({ error: "invalid input" }, { status: 400 });
  const page = await resolveAudiencePage(
    typeof body.audience === "string" ? body.audience : null,
    typeof body.cursor === "string" ? body.cursor : null,
    typeof body.limit === "number" ? body.limit : 500,
  );
  return Response.json(page);
});
