import { ValidationError } from "@foundry/commons";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingCatalog, PricingSelections } from "@/lib/pricing";
import { effectivePrice } from "@/lib/pricing/meal-size-discount";

export const MIN_PERSONS = 1;
export const MAX_PERSONS = 5;

export function buildPricingCatalog(snapshot: CatalogSnapshot, selections: PricingSelections): PricingCatalog {
  if (!Number.isInteger(selections.persons) || selections.persons < MIN_PERSONS || selections.persons > MAX_PERSONS) {
    throw new ValidationError(`Persons must be an integer ${MIN_PERSONS}–${MAX_PERSONS}`);
  }
  if (!Array.isArray(selections.mealSlots) || selections.mealSlots.length === 0) {
    throw new ValidationError("At least one category is required");
  }

  const mealSize = snapshot.mealSizes.find((m) => m.publicId === selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");

  const frequency = snapshot.frequencies.find((f) => f.key === selections.frequencyKey);
  if (!frequency) throw new ValidationError("Invalid frequency");

  if (!snapshot.durations.some((d) => d.weeks === selections.durationWeeks)) {
    throw new ValidationError("Invalid duration");
  }

  // Eligible add-ons are the union of whatever's attached to this meal size's own
  // component categories — never trust the client's addonSelections as-is,
  // re-derive eligibility (and the maxQty ceiling) from the snapshot and reject
  // anything outside it.
  const eligibleAddons = new Map<string, { key: string; name: string; pricePerWeek: number; maxQty: number }>();
  for (const item of mealSize.items) {
    for (const addon of snapshot.addonsByCategory?.[item.category] ?? []) eligibleAddons.set(addon.key, addon);
  }
  const addonSelections = selections.addonSelections ?? [];
  const addons = addonSelections.map(({ key, qty }) => {
    const addon = eligibleAddons.get(key);
    if (!addon) throw new ValidationError(`Add-on not available: ${key}`);
    if (!Number.isInteger(qty) || qty < 1 || qty > addon.maxQty) {
      throw new ValidationError(`Invalid quantity for ${addon.name} (1–${addon.maxQty})`);
    }
    return { key: addon.key, name: addon.name, pricePerWeek: addon.pricePerWeek, qty };
  });

  return {
    mealSize: { id: mealSize.publicId, basePrice: effectivePrice(mealSize.basePrice, mealSize) },
    frequency: { key: frequency.key, daysPerWeek: frequency.daysPerWeek },
    tiers: snapshot.tiers,
    addons,
  };
}
