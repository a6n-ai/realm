import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { discounts } from "@/db/schema";
import { discountService } from "@/lib/catalog/catalog.service";
import { loadCatalogSnapshot } from "../load";

const cleanup = () => db.delete(discounts).where(like(discounts.key, "zz-waiver-%"));

describe("fee waivers in the catalog snapshot", () => {
  afterAll(cleanup);

  it("loads waivers separately, never as additive discount lines", async () => {
    await cleanup();
    await discountService.create({ key: "zz-waiver-free-delivery", name: "Launch offer", kind: "waiver_delivery", percent: "100" });
    await discountService.create({ key: "zz-waiver-tax", name: "Tax on us", kind: "waiver_tax", percent: "100" });
    const snap = await loadCatalogSnapshot();
    expect(snap.waivers?.filter((w) => w.key.startsWith("zz-waiver-")).map((w) => [w.key, w.name, w.kind])).toEqual(
      expect.arrayContaining([["zz-waiver-free-delivery", "Launch offer", "waiver_delivery"], ["zz-waiver-tax", "Tax on us", "waiver_tax"]]),
    );
    expect(snap.discounts?.some((d) => d.key.startsWith("zz-waiver-"))).toBe(false);
  });

  it("rejects a target on a non-strategy waiver, and a strategy waiver without one", async () => {
    await expect(discountService.create({ key: "zz-waiver-bad", name: "x", kind: "waiver_strategy", percent: "100", targetId: null })).rejects.toThrow(/Pick the strategy/);
    await expect(discountService.create({ key: "zz-waiver-bad2", name: "x", kind: "waiver_base", percent: "100", minWeeks: "4" })).rejects.toThrow(/minimum plan length/);
  });

  it("min eating days is delivery only and capped at 7", async () => {
    for (const kind of ["duration", "meal_size", "waiver_delivery"]) {
      await expect(discountService.create({ key: "zz-waiver-eat", name: "x", kind, percent: "10", minEatingDays: "4" })).rejects.toThrow("Only delivery discounts use minimum eating days");
    }
    await expect(discountService.create({ key: "zz-waiver-eat", name: "x", kind: "delivery", percent: "10", minEatingDays: "8" })).rejects.toThrow(/Max 7 days/);
    const row = await discountService.create({ key: "zz-waiver-eat", name: "x", kind: "delivery", percent: "10", minEatingDays: "4" });
    expect(row.minEatingDays).toBe(4);
    const dur = await discountService.create({ key: "zz-waiver-eat2", name: "x", kind: "duration", percent: "10" });
    await expect(discountService.update(dur.publicId, { minEatingDays: "4" })).rejects.toThrow("Only delivery discounts use minimum eating days");
  });
});
