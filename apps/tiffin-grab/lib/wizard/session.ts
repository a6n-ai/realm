import type { WizardOrigin, WizardSelections } from "@/lib/wizard/selections";

/** The plan being built, handed from the stepper to checkout through this tab's sessionStorage. */
export const WIZARD_STORAGE_KEY = "tiffin.wizard";
/** Which flow wrote WIZARD_STORAGE_KEY: checkout's "Edit plan" returns to that flow's page. */
export const WIZARD_ORIGIN_KEY = "tiffin.wizard.origin";
/** The plan steps the customer came through (JSON string[]), so checkout's Plan segment keeps the same ticks. */
export const WIZARD_PLAN_STEPS_KEY = "tiffin.wizard.planSteps";
/** Wizard step to reopen on when "Edit plan" comes back from checkout. */
export const WIZARD_STEP_KEY = "tiffin.wizard.step";
/** Coupon codes from the quote, handed from the stepper to checkout, which tries them on its first price. */
export const QUOTE_CODES_KEY = "tiffin.quote.codes";
/** Coins the customer agreed to use, handed to checkout the same way; its server price clamps them. */
export const QUOTE_COINS_KEY = "tiffin.quote.coins";

const ORIGIN_HREF: Record<WizardOrigin, string> = { subscribe: "/subscribe", renew: "/me/renew", trial: "/me/trial" };

export const asWizardOrigin = (raw: string | null | undefined): WizardOrigin => (raw === "renew" || raw === "trial" ? raw : "subscribe");
export const originHref = (origin: string | null | undefined) => ORIGIN_HREF[asWizardOrigin(origin)];

export const parsePlanSteps = (raw: string | null): string[] => {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "string")) return v;
  } catch { /* stale or hand-edited storage: fall back */ }
  return ["Plan"];
};

const get = (key: string) => sessionStorage.getItem(key);
const set = (key: string, value: string) => sessionStorage.setItem(key, value);
const remove = (...keys: string[]) => { for (const k of keys) sessionStorage.removeItem(k); };

export const wizardSession = {
  selectionsRaw: () => get(WIZARD_STORAGE_KEY),
  origin: () => get(WIZARD_ORIGIN_KEY),
  step: () => Number(get(WIZARD_STEP_KEY)),
  planStepsRaw: () => get(WIZARD_PLAN_STEPS_KEY),
  quote(): { codes: string[]; coins: number } {
    let codes: string[] = [];
    try { codes = JSON.parse(get(QUOTE_CODES_KEY) ?? "[]") as string[]; } catch { /* unreadable: no codes */ }
    return { codes, coins: Math.max(0, Math.floor(Number(get(QUOTE_COINS_KEY)) || 0)) };
  },

  saveSelections: (s: WizardSelections) => set(WIZARD_STORAGE_KEY, JSON.stringify(s)),
  saveStep: (n: number) => set(WIZARD_STEP_KEY, String(n)),
  saveHandoff(h: { selections: WizardSelections; origin: WizardOrigin; planSteps: readonly string[]; codes: string[]; coins?: number }) {
    set(WIZARD_STORAGE_KEY, JSON.stringify(h.selections));
    set(WIZARD_ORIGIN_KEY, h.origin);
    set(WIZARD_PLAN_STEPS_KEY, JSON.stringify(h.planSteps));
    if (h.codes.length) set(QUOTE_CODES_KEY, JSON.stringify(h.codes));
    if (h.coins) set(QUOTE_COINS_KEY, String(h.coins));
  },

  clearQuoteCodes: () => remove(QUOTE_CODES_KEY),
  clearQuoteCoins: () => remove(QUOTE_COINS_KEY),
  /** Checkout placed the order: the saved plan and step go, the origin and quote keys stay. */
  clearDraft: () => remove(WIZARD_STORAGE_KEY, WIZARD_STEP_KEY),
  clearAll: () => remove(WIZARD_STORAGE_KEY, WIZARD_STEP_KEY, WIZARD_ORIGIN_KEY, WIZARD_PLAN_STEPS_KEY, QUOTE_CODES_KEY, QUOTE_COINS_KEY),
};
