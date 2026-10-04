import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { addons, deliveryFrequencies, plans } from "@/db/schema";
import { addonService, deliveryFrequencyService, planService } from "@/lib/services/catalog.service";

afterEach(async () => {
  await db.delete(plans).where(eq(plans.key, "zz-test-plan"));
  await db.delete(deliveryFrequencies).where(eq(deliveryFrequencies.key, "zz-test-freq"));
  await db.delete(addons).where(eq(addons.key, "zz-test-addon"));
});

describe("catalog service validation", () => {
  it("rejects a bad planType enum", async () => {
    await expect(planService.create({ key: "zz-test-plan", name: "ZZ", planType: "deluxe", allowedStartDays: [] }))
      .rejects.toThrow();
  });

  it("rejects a key with spaces", async () => {
    await expect(planService.create({ key: "ZZ Test", name: "ZZ", planType: "tiffin", allowedStartDays: [] }))
      .rejects.toThrow();
  });

  it("coerces numeric strings and persists surfaced columns", async () => {
    const row = await deliveryFrequencyService.create({ key: "zz-test-freq", name: "ZZ Freq", daysPerWeek: "5" });
    expect(row.daysPerWeek).toBe(5);
  });

  it("addon create works (new resource)", async () => {
    const [plan] = await db.select({ publicId: plans.publicId }).from(plans).limit(1);
    const row = await addonService.create({ key: "zz-test-addon", name: "ZZ Addon", category: "uncategorized", planId: plan.publicId, pricePerTiffin: "12.50" });
    expect(row.key).toBe("zz-test-addon");
  });

  it("partial update (reactivate) passes validation", async () => {
    const [plan] = await db.select({ publicId: plans.publicId }).from(plans).limit(1);
    const row = await addonService.create({ key: "zz-test-addon", name: "ZZ Addon", category: "uncategorized", planId: plan.publicId, pricePerTiffin: "10" });
    await expect(addonService.update(row.publicId, { active: false })).resolves.toBeTruthy();
    await expect(addonService.update(row.publicId, { active: true })).resolves.toBeTruthy();
  });
});
