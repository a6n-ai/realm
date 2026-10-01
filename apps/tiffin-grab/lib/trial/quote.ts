import { parseIsoDateUtc, ValidationError, weekdayKey } from "@foundry/commons";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { effectivePrice } from "@/lib/pricing/meal-size-discount";
import type { PricingCatalog, PricingSelections } from "@/lib/pricing/types";
import { getTrialSettings } from "@/lib/services/app-settings.service";
import { assertTrialStart, durationWeeksCovering, orderedTrialWeekdays, resolveTrialDays, trialDeliveryDates, trialSendDays, type TrialWeekday } from "./schedule";

export type TrialQuote = {
  dates: string[];
  /** Weekdays of `dates`, in week order: the order's eating days, like a regular meal size. */
  eatingDays: TrialWeekday[];
  length: number;
  weekdays: string[];
  frequencyKey: string;
  frequencyId: bigint;
  durationWeeks: number;
  /** Selections that make priceSubscription bill `length` tiffins and no weekly discount. */
  pricingSelections: PricingSelections;
  catalog: PricingCatalog;
};

export async function quoteTrial(snapshot: CatalogSnapshot, selections: PricingSelections): Promise<TrialQuote> {
  const meal = snapshot.mealSizes.find((m) => m.publicId === selections.mealSizeId);
  if (!meal?.trial) throw new ValidationError("This meal isn't a trial");
  if (meal.custom) throw new ValidationError("A custom meal can't be a trial");

  const settings = await getTrialSettings();
  const weekdays = trialSendDays(settings.weekdays, meal.servesWeekends);
  if (settings.maxDays == null || settings.maxDays < 1 || weekdays.length === 0) {
    throw new ValidationError("Trials aren't available right now");
  }
  const { sendDays, length } = resolveTrialDays(weekdays, settings.maxDays, selections.eatingDays, selections.trialDays);
  assertTrialStart(selections.startDate, sendDays, new Date());
  const dates = trialDeliveryDates(selections.startDate, length, sendDays);

  // A trial is delivered every day it runs, so it rides the frequency with the most delivery days.
  const frequency = snapshot.frequencies
    .filter((f) => f.weekdays?.length)
    .sort((a, b) => (b.weekdays?.length ?? 0) - (a.weekdays?.length ?? 0))[0] ?? snapshot.frequencies[0];
  if (!frequency) throw new ValidationError("No delivery frequency is configured");

  const persons = selections.persons;
  if (!Number.isInteger(persons) || persons < 1 || persons > 5) {
    throw new ValidationError("Persons must be an integer 1–5");
  }

  const pricingSelections: PricingSelections = {
    ...selections,
    trialDays: length,
    eatingDays: undefined,
    durationWeeks: 1,
    includeSaturday: false,
    includeSunday: false,
    addonSelections: [],
    persons,
    mealSlots: selections.mealSlots.length > 0 ? selections.mealSlots : ["lunch"],
  };

  return {
    dates,
    eatingDays: orderedTrialWeekdays(dates.map((d) => weekdayKey(parseIsoDateUtc(d)))),
    length,
    weekdays: sendDays,
    frequencyKey: frequency.key,
    frequencyId: frequency.id,
    durationWeeks: durationWeeksCovering(dates[0]!, dates[dates.length - 1]!),
    pricingSelections,
    catalog: trialCatalog(snapshot, meal, length, pricingSelections),
  };
}

function trialCatalog(
  snapshot: CatalogSnapshot,
  meal: CatalogSnapshot["mealSizes"][number],
  length: number,
  selections: PricingSelections,
): PricingCatalog {
  let deliveryChargeConfig: PricingCatalog["deliveryChargeConfig"];
  if (snapshot.deliveryCharges) {
    const dc = snapshot.deliveryCharges;
    const picks: unknown = selections.deliveryStrategyIds ?? [];
    const tagPick: unknown = selections.deliveryTagId ?? null;
    if (!Array.isArray(picks) || picks.some((p) => typeof p !== "string") || (tagPick !== null && typeof tagPick !== "string")) {
      throw new ValidationError("Invalid delivery options");
    }
    if (tagPick && !dc.strategyGroups?.some((g) => g.publicId === tagPick)) throw new ValidationError("That place type isn't available");
    const sets = new Set<string>();
    const strategies = (picks as string[]).map((id) => {
      const s = dc.deliveryStrategies.find((o) => o.publicId === id && o.active);
      if (!s) throw new ValidationError("That delivery strategy isn't available");
      if (s.groupPublicId !== (tagPick ?? (dc.deliveryStrategies.find((o) => o.publicId === picks[0])?.groupPublicId ?? null))) {
        throw new ValidationError("Delivery strategies must all be for the chosen place");
      }
      if (s.connectionPublicId) {
        if (sets.has(s.connectionPublicId)) throw new ValidationError("Pick only one of those connected strategies");
        sets.add(s.connectionPublicId);
      }
      const group = dc.strategyGroups?.find((g) => g.publicId === s.groupPublicId);
      return { id: s.publicId, name: s.name, group: group?.name ?? null, chargeType: s.chargeType, chargeValue: s.chargeValue, basis: s.chargeBasis ?? "once" as const };
    });
    const at = selections.addressTagId
      ? dc.addressTags.find((a) => a.publicId === selections.addressTagId && a.active)
      : null;
    if (selections.addressTagId && !at) throw new ValidationError("Invalid address tag");
    deliveryChargeConfig = {
      baseCharge: dc.baseCharge,
      deliveryStrategies: strategies,
      deliveryCount: length,
      addressTag: at ? { id: at.publicId, name: at.name, chargeType: at.chargeType, chargeValue: at.chargeValue } : null,
    };
  }

  return {
    mealSize: { id: meal.publicId, basePrice: effectivePrice(meal.basePrice, meal) },
    frequency: { key: "trial", daysPerWeek: length },
    addons: [],
    discounts: [],
    maxDiscountPct: snapshot.maxDiscountPct ?? 25,
    deliveryCount: length,
    waivers: (snapshot.waivers ?? []).map((w) => ({ key: w.key, name: w.name, kind: w.kind, strategyId: w.targetPublicId, percent: w.percent })),
    deliveryChargeConfig,
  };
}
