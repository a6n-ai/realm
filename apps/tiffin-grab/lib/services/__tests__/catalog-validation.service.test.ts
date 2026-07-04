import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, plans, pricingTiers } from "@/db/schema";
import { addonService, deliveryFrequencyService, planService, pricingTierService } from "@/lib/services/catalog.service";

afterEach(async () => {
  await db.delete(plans).where(eq(plans.key, "zz-test-plan"));
  await db.delete(deliveryFrequencies).where(eq(deliveryFrequencies.key, "zz-test-freq"));
  await db.delete(addons).where(eq(addons.key, "zz-test-addon"));
  await db.delete(pricingTiers).where(eq(pricingTiers.minQty, 9999));
});

describe("catalog service validation", () => {
  it("rejects a bad planType enum", async () => {
    await expect(planService.create({ key: "zz-test-plan", name: "ZZ", planType: "deluxe", offeredSlots: [], allowedStartDays: [] }))
      .rejects.toThrow();
  });

  it("rejects a key with spaces", async () => {
    await expect(planService.create({ key: "ZZ Test", name: "ZZ", planType: "tiffin", offeredSlots: [], allowedStartDays: [] }))
      .rejects.toThrow();
  });

  it("coerces numeric strings and persists surfaced columns", async () => {
    const row = await deliveryFrequencyService.create({ key: "zz-test-freq", name: "ZZ Freq", daysPerWeek: "5", courierDiscountPct: "15" });
    expect(row.daysPerWeek).toBe(5);
    expect(row.courierDiscountPct).toBe(15);
  });

  it("pricing-tier create works (regression: was missing from SERVICES)", async () => {
    const row = await pricingTierService.create({ minQty: 9999, maxQty: null, upliftPct: "2.5" });
    expect(row.minQty).toBe(9999);
  });

  it("addon create works (new resource)", async () => {
    const row = await addonService.create({ key: "zz-test-addon", name: "ZZ Addon", pricePerWeek: "12.50" });
    expect(row.key).toBe("zz-test-addon");
  });

  it("partial update (reactivate) passes validation", async () => {
    const row = await addonService.create({ key: "zz-test-addon", name: "ZZ Addon", pricePerWeek: "10" });
    await expect(addonService.update(row.publicId, { active: false })).resolves.toBeTruthy();
    await expect(addonService.update(row.publicId, { active: true })).resolves.toBeTruthy();
  });
});
