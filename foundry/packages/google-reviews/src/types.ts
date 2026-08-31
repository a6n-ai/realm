export type Review = {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
  profilePhotoUrl?: string;
  authorUrl?: string;
};

export type ReviewsSummary = {
  rating: number;
  total: number;
  reviews: Review[];
  /** Link back to the Google listing — attribution is required. */
  attributionUrl: string;
};

/**
 * `places` ships now (API key, max 5 reviews, no pagination).
 * `business-profile` lands when Google grants API access; it returns every
 * review and is also the surface that supports replying.
 */
export type ReviewsProvider = {
  id: "places" | "business-profile";
  fetchSummary(placeId: string): Promise<ReviewsSummary | null>;
};
