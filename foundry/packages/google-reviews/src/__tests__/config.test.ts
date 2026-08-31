import { describe, it, expect } from "vitest";
import {
  parseGoogleReviewsConfig,
  DEFAULT_GOOGLE_REVIEWS_CONFIG,
} from "../config";

describe("parseGoogleReviewsConfig", () => {
  it("returns the default for empty or invalid input", () => {
    expect(parseGoogleReviewsConfig(undefined)).toEqual(DEFAULT_GOOGLE_REVIEWS_CONFIG);
    expect(parseGoogleReviewsConfig({ installed: "yes" })).toEqual(DEFAULT_GOOGLE_REVIEWS_CONFIG);
  });

  it("defaults provider to places", () => {
    expect(parseGoogleReviewsConfig({ installed: true }).provider).toBe("places");
  });

  it("keeps a configured place id", () => {
    const cfg = parseGoogleReviewsConfig({ installed: true, placeId: "ChIJabc" });
    expect(cfg).toEqual({ installed: true, placeId: "ChIJabc", provider: "places" });
  });
});
