import { describe, it, expect, vi, afterEach } from "vitest";
import { nominatimProvider } from "../nominatim";

const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

function okJson(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("nominatimProvider", () => {
  it("suggest() always returns [] — Nominatim is not a typeahead provider", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("suggest must never hit the network");
    }) as unknown as typeof fetch;

    expect(await nominatimProvider().suggest("danforth")).toEqual([]);
  });

  it("resolve() maps the first search result's string lat/lon to numbers", async () => {
    global.fetch = vi.fn(async () => okJson([{ lat: "43.5", lon: "-79.5" }])) as unknown as typeof fetch;

    const result = await nominatimProvider().resolve({ address: "somewhere", persist: false });
    expect(result?.lat).toBeCloseTo(43.5);
    expect(result?.lng).toBeCloseTo(-79.5);
    expect(result?.formattedAddress).toBe("somewhere");
  });

  it("resolve() returns null when the request fails, rather than throwing", async () => {
    global.fetch = vi.fn(async () => ({ ok: false }) as Response) as unknown as typeof fetch;
    await expect(nominatimProvider().resolve({ address: "nowhere", persist: false })).resolves.toBeNull();
  });

  it("resolve() returns null when fetch rejects, rather than throwing", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network");
    }) as unknown as typeof fetch;
    await expect(nominatimProvider().resolve({ address: "nowhere", persist: false })).resolves.toBeNull();
  });

  it("resolve() ignores persist — there is no storage-licensed bucket for Nominatim", async () => {
    global.fetch = vi.fn(async () => okJson([{ lat: "43.5", lon: "-79.5" }])) as unknown as typeof fetch;
    const withoutPersist = await nominatimProvider().resolve({ address: "somewhere", persist: false });
    const withPersist = await nominatimProvider().resolve({ address: "somewhere", persist: true });
    expect(withoutPersist).toEqual(withPersist);
  });
});
