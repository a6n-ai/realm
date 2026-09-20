import type { PricingSelections } from "@/lib/pricing";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { eatingDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";

export interface WizardSelections extends PricingSelections {
  planKey: string | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

// Which flow wrote WIZARD_STORAGE_KEY — checkout's "Edit plan" back-link returns
// the customer to /subscribe or /me/renew, both of which use the same stepper.
export const WIZARD_ORIGIN_KEY = "tiffin.wizard.origin";
export type WizardOrigin = "subscribe" | "renew";

// Wizard step to reopen on when "Edit plan" comes back from checkout.
export const WIZARD_STEP_KEY = "tiffin.wizard.step";

// Who the visitor said they are at the identity gate, for this browser session
// only. Lets checkout and "Edit plan" skip re-asking the email.
export const IDENTITY_KEY = "tiffin.identity";
export type StoredIdentity = { email: string; kind: "guest" | "member" };

export function readIdentity(): StoredIdentity | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(IDENTITY_KEY) ?? "null") as Partial<StoredIdentity> | null;
    return v && typeof v.email === "string" && v.email && (v.kind === "guest" || v.kind === "member") ? { email: v.email, kind: v.kind } : null;
  } catch {
    return null;
  }
}
export function writeIdentity(identity: StoredIdentity) {
  try { sessionStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* storage unavailable: gate just re-asks */ }
}
export function clearIdentity() {
  try { sessionStorage.removeItem(IDENTITY_KEY); } catch { /* nothing stored */ }
}
/** "Not you?": forget the person AND their in-progress plan, so the next visitor starts clean. */
export function resetSession() {
  try {
    for (const k of [IDENTITY_KEY, WIZARD_STORAGE_KEY, WIZARD_STEP_KEY, WIZARD_ORIGIN_KEY]) sessionStorage.removeItem(k);
  } catch { /* nothing stored */ }
}

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

/** Null when the schedule step is complete and valid; shared by the step and the wizard's Continue gate. */
/** What the customer still needs to do before the current step's button works; null = good to go. */
export function nextBlockedReason(step: number, catalog: ClientCatalogSnapshot, s: WizardSelections): string | null {
  if (step === 0) return s.planKey == null ? "Choose a baseline plan to continue." : null;
  if (step === 1) return s.mealSizeId === "" ? "Pick a meal size to continue." : null;
  if (step === 2) {
    const err = scheduleError(catalog, s);
    if (err) return err.endsWith(".") ? err : `${err}.`;
    return null;
  }
  if (s.mealSizeId === "") return "Pick a meal size on the Bundle step to continue.";
  if (!s.startDate) return "Choose a start date to continue.";
  return null;
}

export function scheduleError(catalog: ClientCatalogSnapshot, s: WizardSelections): string | null {
  const row = selectableFrequencies(catalog).find((f) => f.key === s.frequencyKey);
  if (!row) return "Choose a delivery frequency";
  return eatingDaysError(row.weekdays as DayOfWeek[], s.eatingDays ?? [], tiffinBounds(catalog));
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
  } | null,
): WizardSelections {
  if (!prior) return initialSelections;
  const planKey = asPlanKey(catalog, prior.planKey);
  const plan = catalog.plans.find((p) => p.key === planKey);
  const mealSizeId =
    prior.mealSizePublicId &&
    catalog.mealSizes.some((m) => m.publicId === prior.mealSizePublicId && m.planKey === planKey)
      ? prior.mealSizePublicId
      : "";
  return {
    planKey,
    mealSizeId,
    // Not carried over from the prior order: the controls for these are gone, so
    // restoring 2 persons or a Saturday would silently change the quote with
    // nothing on screen to explain it, and no way for the customer to undo it.
    frequencyKey: "",
    eatingDays: DEFAULT_EATING_DAYS,
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
