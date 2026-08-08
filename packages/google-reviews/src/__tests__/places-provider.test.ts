import { describe, it, expect } from "vitest";
import { mapPlaceDetails } from "../places-provider";

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
});
