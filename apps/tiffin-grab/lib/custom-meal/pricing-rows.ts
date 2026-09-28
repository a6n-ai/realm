import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { customMealPricing, dishCategories, plans } from "@/db/schema";
import type { CustomMealPricingRow } from "./pricing";

export type PricingRowView = CustomMealPricingRow & { publicId: string; categoryId: bigint; planId: bigint; active: boolean };

export async function loadPricingRows(q: Pick<typeof db, "select"> = db): Promise<PricingRowView[]> {
  const rows = await q.select({
    publicId: customMealPricing.publicId, categoryId: customMealPricing.categoryId, planId: customMealPricing.planId,
    category: dishCategories.key, planKey: plans.key, pricePerTu: customMealPricing.pricePerTu,
    maxTu: customMealPricing.maxTu, active: customMealPricing.active,
  }).from(customMealPricing)
    .innerJoin(dishCategories, eq(dishCategories.id, customMealPricing.categoryId))
    .innerJoin(plans, eq(plans.id, customMealPricing.planId));
  return rows.map((r) => ({ ...r, pricePerTu: Number(r.pricePerTu), maxTu: r.maxTu == null ? null : Number(r.maxTu) }));
}
