import type { ClientCatalogSnapshot, ClientMealSizeView } from "@/lib/catalog/types";
import { compareOptions, type DealComparison } from "@/lib/pricing/recommend";
import { effectivePrice } from "@/lib/pricing/meal-size-discount";
import { scheduleError, type WizardSelections } from "./selections";

export function frequencyOrDurationDeal(catalog: ClientCatalogSnapshot, selections: WizardSelections, vary: "frequency" | "duration"): DealComparison {
  const ready = selections.mealSizeId !== "" && selections.frequencyKey !== "" && scheduleError(catalog, selections) === null;
  return ready ? compareOptions({ snapshot: catalog, selections, vary }) : { state: "none" };
}

export const mealOffPct = (m: Pick<ClientMealSizeView, "basePrice" | "discountType" | "discountValue">) =>
  m.discountType === "none" || m.basePrice <= 0 ? 0 : Math.round(((m.basePrice - effectivePrice(m.basePrice, m)) / m.basePrice) * 100);

export function bundleDeal(catalog: ClientCatalogSnapshot, selections: WizardSelections): { state: "none" } | { state: "recommend" | "applied"; meal: ClientMealSizeView; pct: number } {
  let best: ClientMealSizeView | null = null;
  for (const m of catalog.mealSizes) {
    if (m.planKey !== selections.planKey || m.trial || mealOffPct(m) <= 0) continue;
    if (!best || mealOffPct(m) > mealOffPct(best)) best = m;
  }
  if (!best) return { state: "none" };
  return { state: best.publicId === selections.mealSizeId ? "applied" : "recommend", meal: best, pct: mealOffPct(best) };
}
