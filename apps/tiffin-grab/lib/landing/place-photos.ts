import "server-only";
import { getGoogleReviewsConfig, loadPlacesApiKeyFromEnv } from "@foundry/google-reviews";
import { integrationsConfigReadStore } from "@/lib/services/app-settings.service";

export type PlacePhoto = { url: string; width: number; height: number; author: string; authorUrl?: string };

type RawPhoto = {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: { displayName?: string; uri?: string }[];
};

type NextFetchInit = RequestInit & { next?: { revalidate?: number } };

const PLACES = "https://places.googleapis.com/v1";
// Same 6h window as the reviews fetch; each media lookup is billed, so it must stay cached.
const REVALIDATE_SECONDS = 21600;

/**
 * Photos on the Google listing (owner and customer uploads, not tied to a review).
 * Media is resolved server-side to a key-free googleusercontent URL, so the API key
 * never reaches the browser. Empty when not connected or on any Google failure.
 */
export async function getPlacePhotos(limit = 8): Promise<PlacePhoto[]> {
  const apiKey = loadPlacesApiKeyFromEnv();
  const cfg = await getGoogleReviewsConfig(integrationsConfigReadStore).catch(() => null);
  if (!apiKey || !cfg?.installed || !cfg.placeId) return [];

  const get = async (url: string, fieldMask?: string) => {
    const init: NextFetchInit = {
      headers: { "X-Goog-Api-Key": apiKey, ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}) },
      next: { revalidate: REVALIDATE_SECONDS },
    };
    const res = await fetch(url, init);
    return res.ok ? res.json() : null;
  };

  try {
    const place = (await get(`${PLACES}/places/${encodeURIComponent(cfg.placeId)}`, "photos")) as { photos?: RawPhoto[] } | null;
    const photos = (place?.photos ?? []).filter((p): p is RawPhoto & { name: string } => Boolean(p.name)).slice(0, limit);

    const resolved = await Promise.all(
      photos.map(async (p): Promise<PlacePhoto | null> => {
        const media = (await get(`${PLACES}/${p.name}/media?maxWidthPx=800&skipHttpRedirect=true`).catch(() => null)) as { photoUri?: string } | null;
        if (!media?.photoUri) return null;
        const author = p.authorAttributions?.[0];
        return {
          url: media.photoUri,
          width: p.widthPx ?? 800,
          height: p.heightPx ?? 600,
          author: author?.displayName?.trim() || "Google user",
          authorUrl: author?.uri,
        };
      }),
    );
    return resolved.filter((p): p is PlacePhoto => p !== null);
  } catch {
    return [];
  }
}
