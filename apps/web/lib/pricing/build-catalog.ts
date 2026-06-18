import { ValidationError } from "@tiffin/commons";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingCatalog, PricingSelections } from "@/lib/pricing";

export function buildPricingCatalog(snapshot: CatalogSnapshot, selections: PricingSelections): PricingCatalog {
  const mealSize = snapshot.mealSizes.find((m) => m.id === selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");

  const frequency = snapshot.frequencies.find((f) => f.key === selections.frequencyKey);
  if (!frequency) throw new ValidationError("Invalid frequency");

  const durationPackage = snapshot.durations.find((d) => d.weeks === selections.durationWeeks);
  if (!durationPackage) throw new ValidationError("Invalid duration");

  const sat = snapshot.addons.find((a) => a.key === "saturday")?.pricePerWeek ?? 0;
  const sun = snapshot.addons.find((a) => a.key === "sunday")?.pricePerWeek ?? 0;

  return {
    mealSize: { id: mealSize.id, basePrice: mealSize.basePrice },
    frequency: { key: frequency.key, daysPerWeek: frequency.daysPerWeek, courierDiscountPct: frequency.courierDiscountPct },
    addons: { saturday: sat, sunday: sun },
    durationPackage: { weeks: durationPackage.weeks, discountPct: durationPackage.discountPct },
  };
}
