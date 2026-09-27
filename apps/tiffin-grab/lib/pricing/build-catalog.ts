import { ValidationError } from "@foundry/commons";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { PricingCatalog, PricingSelections } from "@/lib/pricing";
import { applicableRules } from "@/lib/pricing/discounts";
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

  const duration = snapshot.durations.find((d) => d.weeks === selections.durationWeeks);
  if (!duration) throw new ValidationError("Invalid duration");
  const applicable = applicableRules(
    (snapshot.discounts ?? []).map((d) => ({ key: d.key, kind: d.kind, percent: d.percent, targetKey: d.targetPublicId, minWeeks: d.minWeeks })),
    { targets: { delivery: frequency.publicId, duration: duration.publicId }, weeks: selections.durationWeeks },
  );
  const byKey = new Map((snapshot.discounts ?? []).map((d) => [d.key, d]));
  const discounts = applicable.map((d) => ({
    key: d.key,
    label: `${byKey.get(d.key)!.kind === "delivery" ? "Delivery schedule discount" : "Plan length discount"} (${d.percent}%)`,
    percent: d.percent,
  }));

  let deliveryChargeConfig: PricingCatalog["deliveryChargeConfig"] = undefined;
  if (snapshot.deliveryCharges) {
    const dc = snapshot.deliveryCharges;
    const answered = new Set<string>();
    const picks: unknown = selections.deliveryStrategyIds ?? [];
    // Server-action input: the shape is not guaranteed by the type.
    if (!Array.isArray(picks) || picks.some((p) => typeof p !== "string")) throw new ValidationError("Invalid delivery options");
    const strategies = (picks as string[]).map((id) => {
      const s = dc.deliveryStrategies.find((o) => o.publicId === id && o.active);
      if (!s) throw new ValidationError("That delivery strategy isn't available");
      const group = dc.strategyGroups?.find((g) => g.publicId === s.groupPublicId);
      // One pick per tag: two would stack both surcharges for one question.
      const key = s.groupPublicId ?? s.publicId;
      if (answered.has(key)) throw new ValidationError(`Pick one strategy for ${group?.name ?? "each tag"}`);
      answered.add(key);
      return { id: s.publicId, name: s.name, group: group?.name ?? null, chargeType: s.chargeType, chargeValue: s.chargeValue };
    });

    const at = selections.addressTagId
      ? snapshot.deliveryCharges.addressTags.find((a) => a.publicId === selections.addressTagId && a.active)
      : null;
    if (selections.addressTagId && !at) {
      throw new ValidationError("Invalid address tag");
    }

    deliveryChargeConfig = {
      baseCharge: snapshot.deliveryCharges.baseCharge,
      deliveryStrategies: strategies,
      addressTag: at ? { id: at.publicId, name: at.name, chargeType: at.chargeType, chargeValue: at.chargeValue } : null,
    };
  }

  return {
    mealSize: { id: mealSize.publicId, basePrice: effectivePrice(mealSize.basePrice, mealSize) },
    frequency: { key: frequency.key, daysPerWeek: frequency.daysPerWeek },
    tiers: snapshot.tiers,
    addons,
    discounts,
    maxDiscountPct: snapshot.maxDiscountPct ?? 25,
    deliveryChargeConfig,
  };
}

/**
 * The first required tag the picks leave unanswered, or null. Checked on the
 * customer's checkout only: staff-created orders and re-pricing may carry no picks.
 */
export function missingRequiredStrategy(snapshot: CatalogSnapshot, picks: string[] | undefined): string | null {
  const dc = snapshot.deliveryCharges;
  if (!dc?.strategyGroups?.length) return null;
  const answered = new Set(
    (picks ?? []).map((id) => dc.deliveryStrategies.find((o) => o.publicId === id)?.groupPublicId).filter(Boolean),
  );
  // A required tag with no active strategy can't be answered, so it can't block checkout.
  const offered = new Set(dc.deliveryStrategies.filter((o) => o.active).map((o) => o.groupPublicId));
  return dc.strategyGroups.find((g) => g.required && offered.has(g.publicId) && !answered.has(g.publicId))?.name ?? null;
}
