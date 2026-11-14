import { getGoogleReviewsConfig, getReviewsSummary, loadPlacesApiKeyFromEnv } from "@foundry/google-reviews";
import { integrationsConfigReadStore } from "@/lib/payments/integrations-config";

/** Plugin installed, listing set and key present. Cheap (no Google call): gates links, not content. */
export async function reviewsConnected(): Promise<boolean> {
  const cfg = await getGoogleReviewsConfig(integrationsConfigReadStore).catch(() => null);
  return Boolean(cfg?.installed && cfg.placeId && loadPlacesApiKeyFromEnv());
}

// Null on any failure: the header renders on static pages that prerender at build, with no DB.
export const summaryOrNull = () => getReviewsSummary(integrationsConfigReadStore).catch(() => null);
