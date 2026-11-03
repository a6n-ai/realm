import { publicSiteState as marker, revalidateSitePaths } from "@/lib/landing/revalidate-site";
import { lastBoundary, loadWindowEdges } from "@/lib/landing/site-boundaries";
import { getAppSettings } from "@/lib/services/app-settings.service";

// ISR is stale-while-revalidate: a quiet page would serve yesterday's menu or an ended promo to the
// first visitor of the day. Every minute (Worker cron) we revalidate once per day / promo edge.
// Fail-closed CRON_SECRET.
export const dynamic = "force-dynamic";

// Isolates may still serve a stale L1 copy (<= 60 s) when an admin edit regenerates the pages, so one
// follow-up revalidation runs once the edit is this old.
const FOLLOW_UP_AFTER_MS = 90_000;

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const now = Date.now();
    const { timezone } = await getAppSettings();
    const edges = await loadWindowEdges(now, timezone);
    const boundary = lastBoundary(now, timezone, edges);
    const [last, requestedAt, followedUp] = await Promise.all(
      ["last-boundary", "requested-at", "followed-up"].map(async (k) => (await marker.get<number>(k))?.value),
    );
    const revalidated = last == null || last < boundary;
    const followUp = requestedAt != null && now - requestedAt >= FOLLOW_UP_AFTER_MS && requestedAt > (followedUp ?? 0);
    if (revalidated || followUp) revalidateSitePaths();
    if (revalidated) await marker.set("last-boundary", boundary);
    if (followUp) await marker.set("followed-up", requestedAt);
    return Response.json({ ok: true, revalidated, followUp });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
