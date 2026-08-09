import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { googlePlaceProvider } from "../google-provider";
import { runProviderConformance, UPSTREAM_FAILURE_QUERY, UPSTREAM_SUCCESS_QUERY } from "./provider-conformance";

const ORIGINAL_FETCH = global.fetch;
const ORIGINAL_KEY = process.env.GOOGLE_PLACES_API_KEY;

beforeEach(() => {
  process.env.GOOGLE_PLACES_API_KEY = "test-key";
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function okJson(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("googlePlaceProvider", () => {
  it("resolve() resolves a place_id via Places Details", async () => {
    global.fetch = vi.fn(async () =>
      okJson({ location: { latitude: 43.7, longitude: -79.3 }, formattedAddress: "3315 Danforth Ave" }),
    ) as unknown as typeof fetch;

    const provider = googlePlaceProvider();
    expect(await provider.resolve({ placeId: "ChIJabc", address: "typed", persist: false })).toEqual({
      lat: 43.7,
      lng: -79.3,
      formattedAddress: "3315 Danforth Ave",
    });
  });

  it("resolve() falls back to text search when there is no place_id", async () => {
    global.fetch = vi.fn(async () =>
      okJson({ places: [{ location: { latitude: 43.6, longitude: -79.4 }, formattedAddress: "12 King St" }] }),
    ) as unknown as typeof fetch;

    const provider = googlePlaceProvider();
    expect(await provider.resolve({ address: "12 King St", persist: false })).toEqual({
      lat: 43.6,
      lng: -79.4,
      formattedAddress: "12 King St",
    });
  });

  it("resolve() returns null when the API key is unset, rather than throwing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    global.fetch = vi.fn(async () => {
      throw new Error("should not be called without an API key");
    }) as unknown as typeof fetch;

    const provider = googlePlaceProvider();
    expect(await provider.resolve({ address: "x", persist: false })).toBeNull();
  });

  it("resolve() returns null when every source fails", async () => {
    global.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    const provider = googlePlaceProvider();
    expect(await provider.resolve({ address: "nowhere", persist: false })).toBeNull();
  });

  it("suggest() maps autocomplete predictions to placeId/label", async () => {
    global.fetch = vi.fn(async () =>
      okJson({ suggestions: [{ placePrediction: { placeId: "p1", text: { text: "3315 Danforth Ave" } } }] }),
    ) as unknown as typeof fetch;

    const provider = googlePlaceProvider();
    expect(await provider.suggest("danfor")).toEqual([{ placeId: "p1", label: "3315 Danforth Ave" }]);
  });

  it("suggest() returns [] when the API key is unset, rather than throwing", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    global.fetch = vi.fn(async () => {
      throw new Error("should not be called without an API key");
    }) as unknown as typeof fetch;

    const provider = googlePlaceProvider();
    expect(await provider.suggest("danfor")).toEqual([]);
  });

  it("suggest() returns [] on a malformed response instead of throwing", async () => {
    global.fetch = vi.fn(async () => okJson({})) as unknown as typeof fetch;
    const provider = googlePlaceProvider();
    expect(await provider.suggest("danfor")).toEqual([]);
  });

  it("suggest() never calls fetch for a whitespace-only query — the empty-input guard", async () => {
    const fetchSpy = vi.fn(async () => okJson({ suggestions: [{ placePrediction: { placeId: "p1", text: { text: "x" } } }] }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const provider = googlePlaceProvider();
    expect(await provider.suggest("   ")).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolve() returns null when persist: true — Google has no storage-licensed bucket", async () => {
    const fetchSpy = vi.fn(async () =>
      okJson({ location: { latitude: 43.7, longitude: -79.3 }, formattedAddress: "3315 Danforth Ave" }),
    );
    global.fetch = fetchSpy as unknown as typeof fetch;
    const provider = googlePlaceProvider();
    expect(await provider.resolve({ placeId: "ChIJabc", address: "typed", persist: true })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolve() never calls fetch for a whitespace-only address with no placeId — the empty-input guard", async () => {
    const fetchSpy = vi.fn(async () => okJson({ places: [{ location: { latitude: 43.6, longitude: -79.4 }, formattedAddress: "x" }] }));
    global.fetch = fetchSpy as unknown as typeof fetch;
    const provider = googlePlaceProvider();
    expect(await provider.resolve({ address: "   ", persist: false })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

/**
 * Fetch stub for the shared conformance suite. Distinguishes autocomplete vs.
 * text-search requests by URL suffix, and fails only for the sentinel query —
 * mirrors how the AWS fake client keys off command type / QueryText.
 */
let conformanceCallCount = 0;

function makeConformanceProvider() {
  conformanceCallCount = 0;
  global.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    conformanceCallCount++;
    const urlStr = String(url);
    const bodyStr = typeof init?.body === "string" ? init.body : "";
    if (bodyStr.includes(UPSTREAM_FAILURE_QUERY)) throw new Error("network down");

    if (urlStr.endsWith(":autocomplete")) {
      return okJson({
        suggestions: [{ placePrediction: { placeId: "p1", text: { text: UPSTREAM_SUCCESS_QUERY } } }],
      });
    }
    if (urlStr.endsWith(":searchText")) {
      return okJson({
        places: [{ location: { latitude: 43.6853, longitude: -79.3872 }, formattedAddress: UPSTREAM_SUCCESS_QUERY }],
      });
    }
    return { ok: false } as Response; // Places Details — not exercised (conformance never passes placeId)
  }) as unknown as typeof fetch;

  return googlePlaceProvider();
}

runProviderConformance("google", makeConformanceProvider, () => conformanceCallCount);
