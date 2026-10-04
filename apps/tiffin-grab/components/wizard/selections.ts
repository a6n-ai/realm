import type { PricingSelections } from "@/lib/pricing";
import { listableMealSizes, mealSizeAddons, type CatalogAddon, type ClientCatalogSnapshot } from "@/lib/catalog/types";
import { eatingDaysError, weekendDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";

export interface WizardSelections extends PricingSelections {
  planKey: string | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

// Which flow wrote WIZARD_STORAGE_KEY — checkout's "Edit plan" back-link returns
// the customer to /subscribe or /me/renew, both of which use the same stepper.
export const WIZARD_ORIGIN_KEY = "tiffin.wizard.origin";
export type WizardOrigin = "subscribe" | "renew" | "trial";

// Wizard step to reopen on when "Edit plan" comes back from checkout.
export const WIZARD_STEP_KEY = "tiffin.wizard.step";

/**
 * The subscribe wizard still sells one person per order and no separate
 * weekend delivery (weekend tiffins ship with Friday's delivery — see
 * `orderDeliveryDays`/`materializeDeliveries`). That part is unchanged.
 *
 * Delivery frequency itself is no longer locked to 5-day: every active
 * `delivery_frequencies` catalog row (including admin-configured alternate
 * cadences) is selectable. `catalog.frequencies` already comes pre-filtered
 * to active rows, so nothing here needs to re-check availability.
 */
export const FIXED_PERSONS = 1;

export const WEEK_DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
export const DEFAULT_EATING_DAYS: DayOfWeek[] = ["mon", "tue", "wed", "thu", "fri"];

/** Frequencies a customer may pick: active rows (already filtered upstream) that define delivery days. */
export const selectableFrequencies = (catalog: ClientCatalogSnapshot) => catalog.frequencies.filter((f) => f.weekdays?.length);

export const tiffinBounds = (catalog: ClientCatalogSnapshot) => ({
  min: catalog.minTiffinsPerWeek ?? 3,
  max: catalog.maxTiffinsPerWeek ?? 7,
});

/** Add-ons the picked meal offers; none for a trial or before a meal is picked. */
export function offeredAddons(catalog: ClientCatalogSnapshot | undefined, s: WizardSelections): CatalogAddon[] {
  const meal = catalog?.mealSizes.find((m) => m.publicId === s.mealSizeId);
  if (!catalog || !meal || meal.trial) return [];
  return mealSizeAddons(catalog);
}

/** The picked add-ons by name, for summaries; unknown or ineligible keys drop out. */
export function pickedAddons(catalog: ClientCatalogSnapshot | undefined, s: WizardSelections): { name: string; qty: number }[] {
  if (!s.addonSelections?.length) return [];
  const byKey = new Map(offeredAddons(catalog, s).map((a) => [a.key, a]));
  return (s.addonSelections ?? []).flatMap(({ key, qty }) => {
    const a = byKey.get(key);
    return a ? [{ name: a.name, qty }] : [];
  });
}

/** True when the picked size is a trial, so the wizard skips Schedule. */
export function selectionIsTrial(catalog: ClientCatalogSnapshot, s: WizardSelections): boolean {
  if (s.mealSizeId === "") return false;
  return catalog.mealSizes?.find((m) => m.publicId === s.mealSizeId)?.trial === true;
}

/** Next or previous step. A trial jumps Bundle (1) straight to Start (3). */
export function adjacentWizardStep(step: number, dir: 1 | -1, trial: boolean): number {
  if (trial && dir === 1 && step === 1) return 3;
  if (trial && dir === -1 && step === 3) return 1;
  return step + dir;
}

/** What the customer still needs to do before the current step's button works; null = good to go. */
export function nextBlockedReason(step: number, catalog: ClientCatalogSnapshot, s: WizardSelections): string | null {
  if (step === 0) return s.planKey == null ? "Choose a baseline plan to continue." : null;
  if (step === 1) return s.mealSizeId === "" ? "Pick a meal size to continue." : null;
  if (step === 2 && selectionIsTrial(catalog, s)) return null;
  if (step === 2) {
    const err = scheduleError(catalog, s);
    if (err) return err.endsWith(".") ? err : `${err}.`;
    return null;
  }
  if (s.mealSizeId === "") return "Pick a meal size on the Bundle step to continue.";
  if (selectionIsTrial(catalog, s) && (s.trialDays == null || s.trialDays < 1)) return "Choose how many trial days to continue.";
  if (!s.startDate) return "Choose a start date to continue.";
  return null;
}

export function scheduleError(catalog: ClientCatalogSnapshot, s: WizardSelections): string | null {
  const row = selectableFrequencies(catalog).find((f) => f.key === s.frequencyKey);
  if (!row) return "Choose a delivery frequency";
  return eatingDaysError(row.weekdays as DayOfWeek[], s.eatingDays ?? [], tiffinBounds(catalog))
    ?? weekendDaysError(s.eatingDays ?? [], servesWeekends(catalog, s));
}

/** Unknown size (not picked yet) doesn't block weekends; createOrder re-checks the real one. */
export function servesWeekends(catalog: ClientCatalogSnapshot, s: WizardSelections): boolean {
  return catalog.mealSizes?.find((m) => m.publicId === s.mealSizeId)?.servesWeekends ?? true;
}

// Validates against the live catalog rather than a hardcoded plan list — a
// plan set only ever grows (admin adds a diet/plan), so any fixed union here
// would go stale the moment a new one is added.
function asPlanKey(catalog: ClientCatalogSnapshot, key: string | null | undefined): WizardSelections["planKey"] {
  return catalog.plans.find((p) => p.key === key)?.key ?? null;
}

export const initialSelections: WizardSelections = {
  planKey: null,
  mealSizeId: "",
  frequencyKey: "",
  eatingDays: DEFAULT_EATING_DAYS,
  persons: 1,
  // Dish selection now happens per-delivery after subscribing; mealSlots is
  // populated from the chosen plan's categories (see StepBaseline) purely to
  // satisfy the pricing guard — the subscriber never picks it directly.
  mealSlots: [],
  includeSaturday: false,
  includeSunday: false,
  durationWeeks: 1,
  startDate: "",
  addonSelections: [],
};

/** Prefill the renew stepper from the customer's most recent order. Start date stays empty. */
export function selectionsFromPriorOrder(
  catalog: ClientCatalogSnapshot,
  prior: {
    planKey: string;
    mealSizePublicId?: string | null;
    persons: number;
    includeSaturday: boolean;
    includeSunday: boolean;
    durationWeeks: number;
    frequencyKey: string;
    eatingDays?: string[] | null;
  } | null,
): WizardSelections {
  if (!prior) return initialSelections;
  const planKey = asPlanKey(catalog, prior.planKey);
  const plan = catalog.plans.find((p) => p.key === planKey);
  const mealSizeId =
    prior.mealSizePublicId &&
    listableMealSizes(catalog.mealSizes, prior.mealSizePublicId).some((m) => m.publicId === prior.mealSizePublicId && m.planKey === planKey)
      ? prior.mealSizePublicId
      : "";
  return {
    planKey,
    mealSizeId,
    // Not carried over from the prior order: the controls for these are gone, so
    // restoring 2 persons or a Saturday would silently change the quote with
    // nothing on screen to explain it, and no way for the customer to undo it.
    frequencyKey: "",
    eatingDays: (prior.eatingDays as DayOfWeek[] | null | undefined) ?? DEFAULT_EATING_DAYS,
    persons: FIXED_PERSONS,
    mealSlots: plan?.offeredSlots ?? [],
    includeSaturday: false,
    includeSunday: false,
    durationWeeks: prior.durationWeeks > 0 ? prior.durationWeeks : 1,
    startDate: "",
    // Not carried over, same reasoning as frequencyKey/persons above — re-picked fresh.
    addonSelections: [],
  };
}
