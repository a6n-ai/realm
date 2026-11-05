import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const { revalidatePath, evictAll, set, get, scheduleSiteRefreshWake, computeSiteNextAt } = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  evictAll: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
  scheduleSiteRefreshWake: vi.fn(),
  computeSiteNextAt: vi.fn(async () => 99_000),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/cache", () => ({ sharedCache: () => ({ evictAll, set, get }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));
vi.mock("@/lib/services/dish-categories.service", () => ({ dishCategoriesService: {} }));
vi.mock("@/lib/custom-meal/pricing-rows", () => ({ loadPricingRows: vi.fn() }));
vi.mock("@/lib/runtime/background", () => ({
  runInBackground: (fn: () => Promise<unknown>) => {
    void Promise.resolve()
      .then(fn)
      .catch(() => {});
  },
}));
vi.mock("@/lib/runtime/workflow-wake", () => ({ scheduleSiteRefreshWake }));
vi.mock("@/lib/landing/site-boundaries", () => ({ computeSiteNextAt }));

import { revalidatePublicSite } from "../revalidate-site";
import { evictPublicPages } from "../public-cache";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";

beforeEach(() => {
  order.length = 0;
  revalidatePath.mockReset().mockImplementation(() => void order.push("revalidate"));
  set.mockReset().mockResolvedValue(undefined);
  get.mockReset().mockResolvedValue(undefined);
  scheduleSiteRefreshWake.mockReset().mockResolvedValue(undefined);
  computeSiteNextAt.mockClear().mockResolvedValue(99_000);
  evictAll.mockReset().mockImplementation(async () => {
    await Promise.resolve();
    order.push("evict");
  });
});

describe("revalidatePublicSite", () => {
  it("revalidates the site layout", () => {
    revalidatePublicSite();
    expect(revalidatePath).toHaveBeenCalledWith("/site/[org]", "layout");
  });

  it("records requested-at and books one coalesced wake", async () => {
    revalidatePublicSite();
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith("requested-at", expect.any(Number)));
    expect(computeSiteNextAt).toHaveBeenCalled();
    expect(scheduleSiteRefreshWake).toHaveBeenCalledWith(99_000);
  });

  it("does not throw when the background wake path fails", async () => {
    set.mockRejectedValue(new Error("kv down"));
    expect(() => revalidatePublicSite()).not.toThrow();
    await Promise.resolve();
  });

  it("does not throw when revalidatePath throws", () => {
    revalidatePath.mockImplementation(() => {
      throw new Error("Invariant: static generation store missing");
    });
    expect(() => revalidatePublicSite()).not.toThrow();
  });

  it("invalidateCatalogSnapshot revalidates after evicting", async () => {
    await invalidateCatalogSnapshot();
    expect(order).toEqual(["evict", "revalidate"]);
  });

  it("evictPublicPages revalidates after evicting", async () => {
    await evictPublicPages();
    expect(order).toEqual(["evict", "revalidate"]);
  });
});
