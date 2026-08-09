import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ResolvedPlace } from "@realm/places";

// resolve-address.ts builds its provider chain from real awsPlaceProvider()/
// googlePlaceProvider()/nominatimProvider() at module load — the real AWS
// provider talks to a live AWS SDK client, not `fetch`, so stubbing
// global.fetch can't control it (and letting it run for real risks live
// network/credentialed calls in CI). Replace all three factories with fakes
// so this file tests resolve-address.ts's own logic — which provider is
// consulted in which order, and which persist value each export sends —
// not the providers themselves (that's packages/places's job).
const awsResolve = vi.hoisted(() => vi.fn());
const awsSuggest = vi.hoisted(() => vi.fn());
const googleResolve = vi.hoisted(() => vi.fn());
const googleSuggest = vi.hoisted(() => vi.fn());
const nominatimResolve = vi.hoisted(() => vi.fn());

vi.mock("@realm/places", async () => {
  const actual = await vi.importActual<typeof import("@realm/places")>("@realm/places");
  return {
    ...actual,
    awsPlaceProvider: () => ({ id: "aws", resolve: awsResolve, suggest: awsSuggest }),
    googlePlaceProvider: () => ({ id: "google", resolve: googleResolve, suggest: googleSuggest }),
    nominatimProvider: () => ({ id: "nominatim", resolve: nominatimResolve, suggest: async () => [] }),
  };
});

const { resolveAddress, suggestAddresses } = await import("../resolve-address");

const hit: ResolvedPlace = { lat: 43.7, lng: -79.3, formattedAddress: "3315 Danforth Ave" };

beforeEach(() => {
  awsResolve.mockReset().mockResolvedValue(null);
  awsSuggest.mockReset().mockResolvedValue([]);
  googleResolve.mockReset().mockResolvedValue(null);
  googleSuggest.mockReset().mockResolvedValue([]);
  nominatimResolve.mockReset().mockResolvedValue(null);
});

describe("resolveAddress", () => {
  it("resolves via the primary provider (google, by default) without persisting", async () => {
    googleResolve.mockResolvedValueOnce(hit);
    expect(await resolveAddress({ placeId: "ChIJabc", address: "typed" })).toEqual(hit);
    expect(googleResolve).toHaveBeenCalledWith({ placeId: "ChIJabc", address: "typed", persist: false });
    expect(awsResolve).not.toHaveBeenCalled();
  });

  it("falls through aws to Nominatim when google misses", async () => {
    nominatimResolve.mockResolvedValueOnce({ lat: 43.5, lng: -79.5, formattedAddress: "somewhere" });
    const out = await resolveAddress({ address: "somewhere" });
    expect(out).toEqual({ lat: 43.5, lng: -79.5, formattedAddress: "somewhere" });
    expect(googleResolve).toHaveBeenCalledTimes(1);
    expect(awsResolve).toHaveBeenCalledTimes(1);
    expect(nominatimResolve).toHaveBeenCalledTimes(1);
  });

  it("returns null when every provider misses", async () => {
    expect(await resolveAddress({ address: "nowhere" })).toBeNull();
  });

  it("reaches the provider for a picked suggestion with an empty typed address", async () => {
    googleResolve.mockResolvedValueOnce(hit);
    expect(await resolveAddress({ placeId: "ChIJabc", address: "" })).toEqual(hit);
    expect(googleResolve).toHaveBeenCalledWith({ placeId: "ChIJabc", address: "", persist: false });
  });
});

// The app persists no coordinates, so no call may ever ask for the
// storage-licensed bucket. This is the cost and licensing guarantee: a
// reintroduced persist: true would be a ~8x price rise with no functional
// symptom, which is exactly the kind of regression nothing else catches.
describe("the storage bucket is never requested", () => {
  it("sends persist: false on every provider in the chain", async () => {
    await resolveAddress({ address: "12 King St" });
    for (const spy of [googleResolve, awsResolve, nominatimResolve]) {
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ persist: false }));
    }
  });
});

describe("suggestAddresses", () => {
  it("returns the first provider's non-empty result", async () => {
    googleSuggest.mockResolvedValueOnce([{ placeId: "p1", label: "3315 Danforth Ave" }]);
    expect(await suggestAddresses("danfor")).toEqual([{ placeId: "p1", label: "3315 Danforth Ave" }]);
    expect(awsSuggest).not.toHaveBeenCalled();
  });

  it("never returns coordinates — suggestions are placeId/label only", async () => {
    googleSuggest.mockResolvedValueOnce([{ placeId: "p1", label: "3315 Danforth Ave" }]);
    const result = await suggestAddresses("danfor");
    expect(result[0]).toEqual({ placeId: "p1", label: "3315 Danforth Ave" });
  });

  it("falls through to the next provider when the primary has nothing", async () => {
    awsSuggest.mockResolvedValueOnce([{ placeId: "p2", label: "12 King St" }]);
    expect(await suggestAddresses("king")).toEqual([{ placeId: "p2", label: "12 King St" }]);
  });

  it("returns [] when every provider has nothing", async () => {
    expect(await suggestAddresses("nowhere")).toEqual([]);
  });
});
