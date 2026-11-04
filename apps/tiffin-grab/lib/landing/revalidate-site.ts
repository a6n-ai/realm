import { revalidatePath } from "next/cache";
import { sharedCache } from "@/lib/cache";
import { runInBackground } from "@/lib/runtime/background";
import { scheduleSiteRefreshWake } from "@/lib/runtime/workflow-wake";

const WEEK_MS = 7 * 24 * 3600_000;

// Cron bookkeeping (last boundary, requested-at, followed-up). L1 is capped so every isolate sees a fresh value.
export const publicSiteState = sharedCache("public-site", WEEK_MS, WEEK_MS, 60_000);

// Public pages live under app/site/[org] (rewritten from /, /menu...), and Next revalidates a rewritten
// route by its destination path. Call after the shared data caches are evicted.
export function revalidateSitePaths(): void {
  try {
    revalidatePath("/site/[org]", "layout");
  } catch {
    // outside a request scope (seed scripts, services called from tests)
  }
}

// Other isolates may still hold the old data in their L1 when this regenerates; the public-site check revalidates once
// more after that window, keyed on the time recorded here.
export function revalidatePublicSite(): void {
  revalidateSitePaths();
  try {
    // The 90 s follow-up (cron/public-site) only runs if a wake is set for then.
    runInBackground(
      () => Promise.all([publicSiteState.set("requested-at", Date.now()), scheduleSiteRefreshWake(Date.now() + 90_000)]),
      "public-site requested-at",
    );
  } catch {
    // no request context
  }
}
