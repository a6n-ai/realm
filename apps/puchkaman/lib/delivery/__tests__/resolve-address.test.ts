import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { resolveAddress } from "../resolve-address";

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

describe("resolveAddress", () => {
  it("resolves a place_id via Places Details", async () => {
    global.fetch = vi.fn(async () =>
      okJson({ location: { latitude: 43.7, longitude: -79.3 }, formattedAddress: "3315 Danforth Ave" }),
    ) as unknown as typeof fetch;

    expect(await resolveAddress({ placeId: "ChIJabc", address: "typed" })).toEqual({
      lat: 43.7,
      lng: -79.3,
      formattedAddress: "3315 Danforth Ave",
    });
  });

  it("falls back to text search when there is no place_id", async () => {
    global.fetch = vi.fn(async () =>
      okJson({ places: [{ location: { latitude: 43.6, longitude: -79.4 }, formattedAddress: "12 King St" }] }),
    ) as unknown as typeof fetch;

    expect(await resolveAddress({ address: "12 King St" })).toEqual({
      lat: 43.6,
      lng: -79.4,
      formattedAddress: "12 King St",
    });
  });

  it("falls back to Nominatim when Google fails", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false } as Response)
      .mockResolvedValueOnce(okJson([{ lat: "43.5", lon: "-79.5" }])) as unknown as typeof fetch;

    const out = await resolveAddress({ address: "somewhere" });
    expect(out?.lat).toBeCloseTo(43.5);
    expect(out?.lng).toBeCloseTo(-79.5);
  });

  it("returns null when every source fails", async () => {
    global.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await resolveAddress({ address: "nowhere" })).toBeNull();
  });

  it("returns null when the API key is missing and Nominatim also fails", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    global.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    expect(await resolveAddress({ placeId: "ChIJabc", address: "x" })).toBeNull();
  });
});
