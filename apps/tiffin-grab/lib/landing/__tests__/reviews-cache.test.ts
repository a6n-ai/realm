import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string | null>();
const leases = new Set<string>();
const fetchSummary = vi.fn();

vi.mock("@/lib/runtime/lease", () => ({
  readLeaseValue: async (k: string) => store.get(k) ?? null,
  writeLeaseValue: async (k: string, v: string | null) => void store.set(k, v),
  acquireLease: async (k: string) => (leases.has(k) ? false : (leases.add(k), true)),
}));
vi.mock("@foundry/google-reviews", () => ({
  placesProvider: { fetchSummary: (id: string) => fetchSummary(id) },
  getGoogleReviewsConfig: vi.fn(),
  loadPlacesApiKeyFromEnv: vi.fn(),
}));
vi.mock("@/lib/payments/integrations-config", () => ({ integrationsConfigReadStore: {} }));

const { cachedReviewsSummary } = await import("../reviews");

const summary = { rating: 4.8, total: 20, reviews: [], attributionUrl: "https://maps.google.com/x" };
const HOUR = 60 * 60 * 1000;
const seed = (ageMs: number) => store.set("google-reviews:summary:P", JSON.stringify({ at: Date.now() - ageMs, summary }));

describe("cachedReviewsSummary", () => {
  beforeEach(() => {
    store.clear();
    leases.clear();
    fetchSummary.mockReset();
  });

  it("serves a fresh cache without calling Google", async () => {
    seed(HOUR);
    expect(await cachedReviewsSummary("P")).toEqual(summary);
    expect(fetchSummary).not.toHaveBeenCalled();
  });

  it("calls Google once per window, however many renders miss", async () => {
    fetchSummary.mockResolvedValue(null);
    await cachedReviewsSummary("P");
    await cachedReviewsSummary("P");
    await cachedReviewsSummary("P");
    expect(fetchSummary).toHaveBeenCalledTimes(1);
  });

  it("refreshes a stale cache and stores the result", async () => {
    seed(25 * HOUR);
    const next = { ...summary, total: 21 };
    fetchSummary.mockResolvedValue(next);
    expect(await cachedReviewsSummary("P")).toEqual(next);
    fetchSummary.mockClear();
    expect(await cachedReviewsSummary("P")).toEqual(next);
    expect(fetchSummary).not.toHaveBeenCalled();
  });

  it("keeps the old summary when Google fails, but hides it after 3 days", async () => {
    fetchSummary.mockResolvedValue(null);
    seed(25 * HOUR);
    expect(await cachedReviewsSummary("P")).toEqual(summary);
    seed(4 * 24 * HOUR);
    expect(await cachedReviewsSummary("P")).toBeNull();
  });
});
