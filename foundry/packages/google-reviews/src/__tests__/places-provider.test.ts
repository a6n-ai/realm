import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapPlaceDetails, placesProvider } from "../places-provider";

const raw = {
  rating: 4.8,
  userRatingCount: 119,
  googleMapsUri: "https://maps.google.com/?cid=123",
  reviews: [
    {
      rating: 5,
      text: { text: "Best chaat in Scarborough." },
      relativePublishTimeDescription: "2 weeks ago",
      authorAttribution: {
        displayName: "Priya S.",
        photoUri: "https://lh3.googleusercontent.com/a/priya",
        uri: "https://www.google.com/maps/contrib/1",
      },
    },
  ],
};

describe("mapPlaceDetails", () => {
  it("maps a Places response into a ReviewsSummary", () => {
    expect(mapPlaceDetails(raw)).toEqual({
      rating: 4.8,
      total: 119,
      attributionUrl: "https://maps.google.com/?cid=123",
      reviews: [
        {
          author: "Priya S.",
          rating: 5,
          text: "Best chaat in Scarborough.",
          relativeTime: "2 weeks ago",
          profilePhotoUrl: "https://lh3.googleusercontent.com/a/priya",
          authorUrl: "https://www.google.com/maps/contrib/1",
        },
      ],
    });
  });

  it("returns null when the payload has no rating (never a zero rating)", () => {
    expect(mapPlaceDetails({})).toBeNull();
    expect(mapPlaceDetails({ userRatingCount: 10 })).toBeNull();
  });

  it("tolerates a place with a rating but no review bodies", () => {
    const summary = mapPlaceDetails({ rating: 4.2, userRatingCount: 8 });
    expect(summary).toEqual({
      rating: 4.2,
      total: 8,
      attributionUrl: "",
      reviews: [],
    });
  });

  it("drops individual reviews that carry no text", () => {
    const summary = mapPlaceDetails({
      rating: 5,
      userRatingCount: 1,
      reviews: [{ rating: 5, authorAttribution: { displayName: "A" } }],
    });
    expect(summary!.reviews).toEqual([]);
  });

  it("drops individual reviews that carry no author", () => {
    const summary = mapPlaceDetails({
      rating: 5,
      userRatingCount: 1,
      reviews: [{ rating: 5, text: { text: "Great food" } }],
    });
    expect(summary!.reviews).toEqual([]);
  });

  it("drops individual reviews with a non-numeric rating", () => {
    const summary = mapPlaceDetails({
      rating: 5,
      userRatingCount: 1,
      reviews: [
        {
          text: { text: "Great food" },
          authorAttribution: { displayName: "A" },
        },
      ],
    });
    expect(summary!.reviews).toEqual([]);
  });
});

describe("placesProvider.fetchSummary", () => {
  const ORIGINAL_ENV = process.env.GOOGLE_PLACES_API_KEY;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_ENV;
    global.fetch = ORIGINAL_FETCH;
  });

  it("returns null when GOOGLE_PLACES_API_KEY is not set", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    expect(await placesProvider.fetchSummary("ChIJabc")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null for an empty placeId", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    expect(await placesProvider.fetchSummary("")).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns null when fetch rejects (network error)", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    expect(await placesProvider.fetchSummary("ChIJabc")).toBeNull();
  });

  it("returns null on a non-OK response", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false });
    expect(await placesProvider.fetchSummary("ChIJabc")).toBeNull();
  });

  it("returns null when the response body is unparseable", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("bad json");
      },
    });
    expect(await placesProvider.fetchSummary("ChIJabc")).toBeNull();
  });

  it("returns the mapped summary on a successful response", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => raw,
    });
    expect(await placesProvider.fetchSummary("ChIJabc")).toEqual(mapPlaceDetails(raw));
  });
});
