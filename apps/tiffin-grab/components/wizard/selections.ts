import type { PricingSelections } from "@/lib/pricing";
import { listableMealSizes, mealSizeAddons, type CatalogAddon, type ClientCatalogSnapshot } from "@/lib/catalog/types";
import { eatingDaysError, weekendDaysError, type DayOfWeek } from "@/lib/menu/delivery-days";
import { dropOffCatalog, validDropOff } from "@/lib/catalog/drop-off";

export interface WizardSelections extends PricingSelections {
  planKey: string | null;
}

export const WIZARD_STORAGE_KEY = "tiffin.wizard";

// Which flow wrote WIZARD_STORAGE_KEY — checkout's "Edit plan" back-link returns
// the customer to /subscribe or /me/renew, both of which use the same stepper.
export const WIZARD_ORIGIN_KEY = "tiffin.wizard.origin";
export type WizardOrigin = "subscribe" | "renew" | "trial";

// One-shot flags from Quick Renew: open checkout on Pay, with this saved address (publicId).
export const RENEW_PAY_KEY = "tiffin.renew.pay";
export const RENEW_ADDRESS_KEY = "tiffin.renew.address";

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
  if (!selectionIsTrial(catalog, s) && catalog.durations?.length && !catalog.durations.some((d) => d.weeks === s.durationWeeks)) return "Choose a plan length to continue.";
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

/** The offered length closest to `weeks`; a tie takes the shorter, so the price never rises unseen. */
export function nearestOfferedWeeks(offered: readonly { weeks: number }[], weeks: number): number | null {
  let best: number | null = null;
  for (const { weeks: w } of offered) {
    if (best == null || Math.abs(w - weeks) < Math.abs(best - weeks) || (Math.abs(w - weeks) === Math.abs(best - weeks) && w < best)) best = w;
  }
  return best;
}

/**
 * A renewal copies its prior order and a saved cart outlives catalog edits, so either can name
 * something the catalog no longer offers: an imported 3/5/7-week length, a retired meal size,
 * an add-on or drop-off that was switched off. Pricing then throws and checkout dead-ends on
 * "Couldn't load payment options". Run every cart through this before it is priced: a stale
 * length snaps to the nearest offered one, a stale add-on/drop-off drops out, and a stale meal
 * size or frequency clears so the wizard asks for it again.
 */
export function reconcileSelections(catalog: Partial<ClientCatalogSnapshot>, s: WizardSelections): WizardSelections {
  const next = { ...s };
  const plan = catalog.plans?.find((p) => p.key === s.planKey);
  if (catalog.plans && s.planKey != null && !plan) next.planKey = null;
  if (catalog.mealSizes && next.mealSizeId !== "") {
    const ok = listableMealSizes(catalog.mealSizes, next.mealSizeId).some((m) => m.publicId === next.mealSizeId && m.planKey === next.planKey);
    if (!ok) next.mealSizeId = "";
  }
  if (catalog.frequencies && next.frequencyKey !== "" && !catalog.frequencies.some((f) => f.key === next.frequencyKey && f.weekdays?.length)) {
    next.frequencyKey = "";
  }
  if (catalog.durations?.length && !catalog.durations.some((d) => d.weeks === next.durationWeeks)) {
    next.durationWeeks = nearestOfferedWeeks(catalog.durations, next.durationWeeks) ?? next.durationWeeks;
  }
  if (!Number.isInteger(next.persons) || next.persons < 1) next.persons = FIXED_PERSONS;
  if (plan && !next.mealSlots?.length) next.mealSlots = plan.offeredSlots;
  if (catalog.plans && next.addonSelections?.length) {
    const offered = new Map(offeredAddons(catalog as ClientCatalogSnapshot, next).map((a) => [a.key, a]));
    next.addonSelections = next.addonSelections.flatMap(({ key, qty }) => {
      const a = offered.get(key);
      return a && Number.isInteger(qty) && qty >= 1 ? [{ key, qty: Math.min(qty, a.maxQty) }] : [];
    });
  }
  if (next.deliveryTagId || next.deliveryStrategyIds?.length) {
    const v = validDropOff(dropOffCatalog(catalog.deliveryCharges, catalog.waivers), { tagId: next.deliveryTagId ?? null, strategyIds: next.deliveryStrategyIds ?? [] });
    next.deliveryTagId = v.tagId;
    next.deliveryStrategyIds = v.strategyIds;
  }
  if (next.addressTagId && !catalog.deliveryCharges?.addressTags.some((a) => a.id === next.addressTagId)) next.addressTagId = null;
  return next;
}

/** The first wizard step a cart still has to fill in, or null when it can be priced. */
export function firstBlockedStep(catalog: ClientCatalogSnapshot, s: WizardSelections): number | null {
  for (let step = 0; step <= 3; step++) if (nextBlockedReason(step, catalog, s) != null) return step;
  return null;
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
    listableMealSizes(catalog.mealSizes).some((m) => m.publicId === prior.mealSizePublicId && m.planKey === planKey)
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

/**
 * A staff estimate link (`/subscribe?p=veg&m=msz_x&f=5_day&w=4&c=EXTRA5`): the picks a sales rep quoted,
 * carried through sign-in to the renew stepper. Kept short for WhatsApp: one-letter keys, days as
 * digits (1 = Mon … 7 = Sun), and defaults left out (Mon–Fri eating days, one week). Every value is
 * re-checked against the live catalog, so an edited or stale link only drops what no longer exists;
 * the customer re-picks it on that step.
 */
export const QUOTE_PARAMS = ["p", "m", "f", "d", "w", "a", "c"] as const;
export type QuoteParams = Partial<Record<(typeof QUOTE_PARAMS)[number], string>>;

/** Coupon codes from the quote, handed from the stepper to checkout, which tries them on its first price. */
export const QUOTE_CODES_KEY = "tiffin.quote.codes";

/** The link's query for these picks (no leading "?"). */
export function quoteLinkQuery(s: { planKey: string; mealSizeId: string; frequencyKey: string; eatingDays: string[]; durationWeeks: number; addonSelections?: { key: string; qty: number }[]; codes: string[] }): string {
  const q = new URLSearchParams({ p: s.planKey, m: s.mealSizeId, f: s.frequencyKey });
  const days = WEEK_DAYS.filter((d) => s.eatingDays.includes(d));
  if (days.join() !== DEFAULT_EATING_DAYS.join()) q.set("d", days.map((d) => WEEK_DAYS.indexOf(d) + 1).join(""));
  if (s.durationWeeks !== 1) q.set("w", String(s.durationWeeks));
  if (s.addonSelections?.length) q.set("a", s.addonSelections.map((a) => `${a.key}:${a.qty}`).join(","));
  if (s.codes.length) q.set("c", s.codes.join(","));
  // Commas and colons read fine in a link; keep them literal so the WhatsApp text stays short.
  return q.toString().replace(/%2C/g, ",").replace(/%3A/g, ":");
}

export function selectionsFromQuote(catalog: ClientCatalogSnapshot, q: QuoteParams): WizardSelections | null {
  if (!q.p) return null;
  const days = [...new Set((q.d ?? "").split(""))].flatMap((n) => {
    const d = WEEK_DAYS[Number(n) - 1];
    return d ? [d] : [];
  });
  const addonSelections = (q.a ?? "").split(",").flatMap((pair) => {
    const [key, n] = pair.split(":");
    const qty = Number(n);
    return key && Number.isInteger(qty) ? [{ key, qty }] : [];
  });
  const weeks = Number(q.w);
  return reconcileSelections(catalog, {
    ...initialSelections,
    planKey: q.p,
    mealSizeId: q.m ?? "",
    frequencyKey: q.f ?? "",
    eatingDays: days.length ? days : DEFAULT_EATING_DAYS,
    includeSaturday: days.includes("sat"),
    includeSunday: days.includes("sun"),
    durationWeeks: Number.isInteger(weeks) && weeks > 0 ? weeks : 1,
    addonSelections,
  });
}

// Codes are only typed into checkout's coupon field; shape-checked here so a mangled link can't
// smuggle anything else, and capped like the field itself.
export function quoteCodes(q: QuoteParams): string[] {
  const codes = (q.c ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z0-9-]{2,40}$/.test(c));
  return [...new Set(codes)].slice(0, 5);
}

/** The quote params alone, for forwarding through sign-in; "" when the URL carries none. */
export function quoteQuery(params: QuoteParams | URLSearchParams): string {
  const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k as keyof QuoteParams]);
  const out = new URLSearchParams();
  for (const k of QUOTE_PARAMS) {
    const v = get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `?${s}` : "";
}
