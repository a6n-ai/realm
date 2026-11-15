import { getGoogleReviewsConfig, loadPlacesApiKeyFromEnv, placesProvider, type ReviewsSummary } from "@foundry/google-reviews";
import { integrationsConfigReadStore } from "@/lib/payments/integrations-config";
import { acquireLease, readLeaseValue, writeLeaseValue } from "@/lib/runtime/lease";

// Places bills per call, and the OpenNext R2 fetch cache is keyed by build id, so it empties on
// every deploy (Nov 2026: ~$3-4/day). runtime_leases survives deploys, and the refresh lease is
// the spend cap: at most one Google call per REFRESH_MS, whatever the traffic or deploy count.
const REFRESH_MS = 24 * 60 * 60 * 1000;
// Past this, a rating Google can no longer confirm is hidden rather than shown stale.
const MAX_STALE_MS = 3 * 24 * 60 * 60 * 1000;

const valueKey = (placeId: string) => `google-reviews:summary:${placeId}`;
const refreshKey = (placeId: string) => `google-reviews:refresh:${placeId}`;

type Cached = { at: number; summary: ReviewsSummary };

function parse(raw: string | null): Cached | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Cached;
  } catch {
    return null;
  }
}

export async function storeReviewsSummary(placeId: string, summary: ReviewsSummary): Promise<void> {
  await writeLeaseValue(valueKey(placeId), JSON.stringify({ at: Date.now(), summary } satisfies Cached));
}

/** The only path that calls Google for a summary, outside the admin's explicit Save and test. */
export async function cachedReviewsSummary(placeId: string): Promise<ReviewsSummary | null> {
  const cached = parse(await readLeaseValue(valueKey(placeId)));
  const age = cached ? Date.now() - cached.at : Infinity;
  const usable = age < MAX_STALE_MS ? cached!.summary : null;
  if (age < REFRESH_MS) return usable;

  // Taken before the call and never released: a failed fetch also waits out the window.
  if (!(await acquireLease(refreshKey(placeId), "refresh", REFRESH_MS))) return usable;
  const fresh = await placesProvider.fetchSummary(placeId);
  if (!fresh) return usable;
  await storeReviewsSummary(placeId, fresh);
  return fresh;
}

/** Plugin installed, listing set and key present. Cheap (no Google call): gates links, not content. */
export async function reviewsConnected(): Promise<boolean> {
  const cfg = await getGoogleReviewsConfig(integrationsConfigReadStore).catch(() => null);
  return Boolean(cfg?.installed && cfg.placeId && loadPlacesApiKeyFromEnv());
}

// Null on any failure: the header renders on static pages that prerender at build, with no DB.
export async function summaryOrNull(): Promise<ReviewsSummary | null> {
  try {
    const cfg = await getGoogleReviewsConfig(integrationsConfigReadStore);
    if (!cfg.installed || !cfg.placeId || cfg.provider !== "places") return null;
    return await cachedReviewsSummary(cfg.placeId);
  } catch {
    return null;
  }
}
