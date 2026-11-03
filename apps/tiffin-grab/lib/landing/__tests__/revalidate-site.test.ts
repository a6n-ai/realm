import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const { revalidatePath, evictAll, set } = vi.hoisted(() => ({ revalidatePath: vi.fn(), evictAll: vi.fn(), set: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/cache", () => ({ sharedCache: () => ({ evictAll, set }) }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: vi.fn() }));
vi.mock("@/lib/services/dish-categories.service", () => ({ dishCategoriesService: {} }));
vi.mock("@/lib/custom-meal/pricing-rows", () => ({ loadPricingRows: vi.fn() }));

import { revalidatePublicSite } from "../revalidate-site";
import { evictPublicPages } from "../public-cache";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";

beforeEach(() => {
  order.length = 0;
  revalidatePath.mockReset().mockImplementation(() => void order.push("revalidate"));
  set.mockReset().mockResolvedValue(undefined);
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

  it("records when a revalidation was requested, without throwing if that fails", async () => {
    revalidatePublicSite();
    await Promise.resolve();
    expect(set).toHaveBeenCalledWith("requested-at", expect.any(Number));
    set.mockRejectedValue(new Error("kv down"));
    expect(() => revalidatePublicSite()).not.toThrow();
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
