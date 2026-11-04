import { publicSiteState as marker, revalidateSitePaths } from "@/lib/landing/revalidate-site";
import { computeSiteNextAt, lastBoundary, loadWindowEdges } from "@/lib/landing/site-boundaries";
import { scheduleSiteRefreshWake } from "@/lib/runtime/workflow-wake";
import { getAppSettings } from "@/lib/services/app-settings.service";

// Isolates may still serve a stale L1 copy (<= 60 s) when an admin edit regenerates the pages, so one
// follow-up revalidation runs once the edit is this old.
const FOLLOW_UP_AFTER_MS = 90_000;

/** Revalidate the public pages when a boundary or follow-up is due, then chain the next wake. */
export async function runSiteRefresh() {
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
  const requested = followUp ? requestedAt : (await marker.get<number>("requested-at"))?.value;
  const followed = followUp ? requestedAt : followedUp;
  const nextAt = await computeSiteNextAt(now, timezone, { requestedAt: requested, followedUp: followed });
  await scheduleSiteRefreshWake(nextAt);
  return { revalidated, followUp, nextAt };
}
