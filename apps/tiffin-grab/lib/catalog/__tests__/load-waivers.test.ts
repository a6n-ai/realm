import { afterAll, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { discounts } from "@/db/schema";
import { discountService } from "@/lib/services/catalog.service";
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
});
