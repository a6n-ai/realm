import { onlyOnMessage, type DayOfWeek } from "@/lib/menu/delivery-days";
import { parseIsoDateUtc, ValidationError, weekdayKey } from "@foundry/commons";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { effectivePrice } from "@/lib/pricing/meal-size-discount";
import { assertPersons, buildDeliveryChargeConfig, catalogWaivers } from "@/lib/pricing/build-catalog";
import type { PricingCatalog, PricingSelections } from "@/lib/pricing/types";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import { appToday } from "@/lib/services/start-date";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { assertTrialStart, durationWeeksCovering, orderedTrialWeekdays, resolveTrialDays, trialDeliveryDates, trialSendDays } from "./schedule";

export type TrialQuote = {
  dates: string[];
  /** Weekdays of `dates`, in week order: the order's eating days, like a regular meal size. */
  eatingDays: DayOfWeek[];
  length: number;
  weekdays: string[];
  frequencyKey: string;
  frequencyId: bigint;
  durationWeeks: number;
  /** Selections that make priceSubscription bill `length` tiffins and no weekly discount. */
  pricingSelections: PricingSelections;
  catalog: PricingCatalog;
};

export async function quoteTrial(
  snapshot: CatalogSnapshot,
  selections: PricingSelections,
  /** The day start rules count from. */
  startBase: Date = appToday(snapshot.timezone, snapshot.cutoffHour),
): Promise<TrialQuote> {
  const meal = snapshot.mealSizes.find((m) => m.publicId === selections.mealSizeId);
  if (!meal?.trial) throw new ValidationError("This meal isn't a trial");
  if (meal.custom) throw new ValidationError("A custom meal can't be a trial");

  const settings = await getTrialSettings(await resolveRequestOrg());
  const weekdays = trialSendDays(settings.weekdays, meal.servesWeekends, meal.allowedDays);
  if (settings.maxDays == null || settings.maxDays < 1 || weekdays.length === 0) {
    // Trial days exist but none suits this size: say which days it is made on.
    const allSend = trialSendDays(settings.weekdays, meal.servesWeekends);
    const trialsOn = settings.maxDays != null && settings.maxDays >= 1 && allSend.length > 0;
    throw new ValidationError(trialsOn && meal.allowedDays?.length ? onlyOnMessage(meal.allowedDays) : "Trials aren't available right now");
  }
  const { sendDays, length } = resolveTrialDays(weekdays, settings.maxDays, selections.eatingDays, selections.trialDays);
  assertTrialStart(selections.startDate, sendDays, startBase);
  const dates = trialDeliveryDates(selections.startDate, length, sendDays);

  // The trial's delivery frequency from Trial settings, stored on the order like a meal size's.
  const frequency = snapshot.frequencies.find((f) => f.key === settings.frequencyKey);
  if (!frequency) throw new ValidationError("Trials aren't available right now");

  const persons = selections.persons;
  assertPersons(persons);

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
  return {
    mealSize: { id: meal.publicId, basePrice: effectivePrice(meal.basePrice, meal) },
    frequency: { key: "trial", daysPerWeek: length },
    addons: [],
    discounts: [],
    maxDiscountPct: snapshot.maxDiscountPct ?? 25,
    deliveryCount: length,
    waivers: catalogWaivers(snapshot),
    deliveryChargeConfig: buildDeliveryChargeConfig(snapshot, selections, length),
  };
}
