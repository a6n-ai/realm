import { loadPlacesApiKeyFromEnv } from "./config";
import type { Review, ReviewsProvider, ReviewsSummary } from "./types";

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places";
const FIELD_MASK = "rating,userRatingCount,googleMapsUri,reviews";

/** Six hours. Reviews move slowly; ratings should not be a day stale. */
const REVALIDATE_SECONDS = 21600;

/** Next.js's fetch extension isn't ambient outside an app's next-env.d.ts. */
type NextFetchInit = RequestInit & { next?: { revalidate?: number | false } };

type RawReview = {
  rating?: number;
  text?: { text?: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
};

type RawPlace = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: RawReview[];
};

/**
 * Map a Places "place details" payload into a ReviewsSummary.
 * Returns null when there is no rating — callers render nothing rather than a
 * zero-star block, because wrong social proof is worse than none.
 */
export function mapPlaceDetails(raw: RawPlace): ReviewsSummary | null {
  if (typeof raw.rating !== "number") return null;

  const reviews: Review[] = (raw.reviews ?? []).flatMap((r) => {
    const text = r.text?.text?.trim();
    const author = r.authorAttribution?.displayName?.trim();
    if (!text || !author || typeof r.rating !== "number") return [];
    return [
      {
        author,
        rating: r.rating,
        text,
        relativeTime: r.relativePublishTimeDescription ?? "",
        profilePhotoUrl: r.authorAttribution?.photoUri,
        authorUrl: r.authorAttribution?.uri,
      },
    ];
  });

  return {
    rating: raw.rating,
    total: raw.userRatingCount ?? 0,
    attributionUrl: raw.googleMapsUri ?? "",
    reviews,
  };
}

export const placesProvider: ReviewsProvider = {
  id: "places",

  async fetchSummary(placeId: string): Promise<ReviewsSummary | null> {
    const apiKey = loadPlacesApiKeyFromEnv();
    if (!apiKey || !placeId) return null;

    const init: NextFetchInit = {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      next: { revalidate: REVALIDATE_SECONDS },
    };

    let res: Response;
    try {
      res = await fetch(`${PLACES_ENDPOINT}/${encodeURIComponent(placeId)}`, init);
    } catch {
      return null;
    }
    if (!res.ok) return null;

    try {
      return mapPlaceDetails((await res.json()) as RawPlace);
    } catch {
      return null;
    }
  },
};
