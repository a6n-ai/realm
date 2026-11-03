import { sharedCache } from "@/lib/cache";
import { revalidatePublicSite } from "@/lib/landing/revalidate-site";
import { lastBoundary, loadWindowEdges } from "@/lib/landing/site-boundaries";
import { getAppSettings } from "@/lib/services/app-settings.service";

// ISR is stale-while-revalidate: a quiet page would serve yesterday's menu or an ended promo to the
// first visitor of the day. Every minute (Worker cron) we revalidate once per day / promo edge.
// Fail-closed CRON_SECRET.
export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 3600_000;
const marker = sharedCache("public-site", WEEK_MS, WEEK_MS);

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const [{ timezone }, edges] = await Promise.all([getAppSettings(), loadWindowEdges()]);
    const boundary = lastBoundary(Date.now(), timezone, edges);
    const last = (await marker.get<number>("last-boundary"))?.value;
    if (last != null && last >= boundary) return Response.json({ ok: true, revalidated: false });
    revalidatePublicSite();
    await marker.set("last-boundary", boundary);
    return Response.json({ ok: true, revalidated: true });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
