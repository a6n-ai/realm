import type { IntegrationsConfigStore } from "@realm/commons/plugin";
import { placesProvider } from "./places-provider";
import { getGoogleReviewsConfig } from "./store";
import type { ReviewsProvider, ReviewsSummary } from "./types";

const PROVIDERS: Record<string, ReviewsProvider> = {
  places: placesProvider,
  // "business-profile" lands with the Business Profile API grant.
};

/**
 * Public-site entry point. Returns null whenever reviews cannot be shown —
 * plugin uninstalled, no place id, no API key, or the API failed. Callers
 * render nothing in that case; a stale or zeroed rating is worse than none.
 */
export async function getReviewsSummary(
  store: IntegrationsConfigStore,
): Promise<ReviewsSummary | null> {
  const cfg = await getGoogleReviewsConfig(store);
  if (!cfg.installed || !cfg.placeId) return null;

  const provider = PROVIDERS[cfg.provider];
  if (!provider) return null;

  return provider.fetchSummary(cfg.placeId);
}
