import { revalidatePath } from "next/cache";
import { sharedCache } from "@/lib/cache";
import { computeSiteNextAt } from "@/lib/landing/site-boundaries";
import { runInBackground } from "@foundry/cloud/background";
import { scheduleSiteRefreshWake } from "@/lib/runtime/workflow-wake";
import { getAppSettings } from "@/lib/settings";
import { purgeEdgePages } from "@/lib/landing/edge-purge";

const WEEK_MS = 7 * 24 * 3600_000;

// Cron bookkeeping (last boundary, requested-at, followed-up). L1 is capped so every isolate sees a fresh value.
export const publicSiteState = sharedCache("public-site", WEEK_MS, WEEK_MS, true);

// The public API and MCP answers (lib/public-api/load.ts). Kept an hour: every edit that changes the public
// pages, and every promo or cutoff boundary, runs revalidateSitePaths, which clears it. L1 capped like the pages.
export const publicApiCache = sharedCache("public-api", 3600_000, 0, true);

// Public pages live under app/site/[org] (rewritten from /, /menu...), and Next revalidates a rewritten
// route by its destination path. Call after the shared data caches are evicted.
export function revalidateSitePaths(): void {
  runInBackground(() => publicApiCache.evictAll(), "public-api evict");
  try {
    revalidatePath("/site/[org]", "layout");
  } catch {
    // outside a request scope (seed scripts, services called from tests)
  }
  runInBackground(() => purgeEdgePages(), "edge purge");
}

// Other isolates may still hold the old data in their L1 when this regenerates; the public-site check revalidates once
// more after that window, keyed on the time recorded here.
export function revalidatePublicSite(): void {
  revalidateSitePaths();
  try {
    // One wake at computeSiteNextAt, which already includes requestedAt+90s and any sooner boundary.
    runInBackground(async () => {
      const now = Date.now();
      const followedUp = (await publicSiteState.get<number>("followed-up"))?.value;
      await publicSiteState.set("requested-at", now);
      const { timezone } = await getAppSettings();
      const nextAt = await computeSiteNextAt(now, timezone, { requestedAt: now, followedUp });
      await scheduleSiteRefreshWake(nextAt);
    }, "public-site requested-at");
  } catch {
    // no request context
  }
}
