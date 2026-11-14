import { isComingSoon, publicPlans } from "@/lib/landing/plan-options";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { listableMealSizes, type CatalogSnapshot } from "@/lib/catalog/types";
import { CONTACT_EMAIL, SUPPORT_E164 } from "@/lib/landing/contact";
import { runsOf } from "@/lib/landing/areas";
import { biggestDurationOff, deliveryIsFree, hourLabel, paidDropOff, lowestRate, trialLength, trialOffer } from "@/lib/landing/live-figures";
import { effectivePrice } from "@/lib/pricing";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getTrialSettings } from "@/lib/trial/trial-settings.service";

export { CONTACT_EMAIL };
const e = SUPPORT_E164;
export const CONTACT_PHONE = `+${e[0]} (${e.slice(1, 4)}) ${e.slice(4, 7)}-${e.slice(7)}`;

export type FactSize = { name: string; rate: number; trial: boolean; parts: string[]; kcalMin: number; kcalMax: number; proteinG: number | null };
export type FactPlan = { key: string; name: string; description: string | null; sizes: FactSize[] };

/** Everything the FAQ, llms.txt and pricing.md say about the business, read once from live data. */
export type SiteFacts = {
  currency: string;
  from: number | null;
  biggestOff: number | null;
  weeksOff: { weeks: number; percent: number; label: string }[];
  free: boolean;
  /** Optional paid drop-off, named wherever delivery is called free. */
  dropOff: { name: string; charge: number } | null;
  cutoff: string | null;
  areas: string[];
  runs: { label: string; areas: string[] }[];
  trial: { length: string; rate: number } | null;
  plans: FactPlan[];
};

const dashless = (name: string) => name.replace(/\s+[—–]\s+/g, " · ");

export function buildFacts(catalog: CatalogSnapshot, currency: string, trialSettings: Parameters<typeof trialOffer>[1]): SiteFacts {
  const zones = catalog.zones.filter((z) => z.active);
  const trial = trialOffer(catalog, trialSettings);
  const sizes = listableMealSizes(catalog.mealSizes);
  const plans = publicPlans(catalog.plans)
    .filter((p) => !isComingSoon(p.key))
    .map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      sizes: sizes
        .filter((m) => m.planKey === p.key)
        .map((m) => ({ name: dashless(m.name), rate: effectivePrice(m.basePrice, m), trial: m.trial, parts: m.components, kcalMin: m.kcalMin, kcalMax: m.kcalMax, proteinG: m.proteinG }))
        .sort((a, b) => a.rate - b.rate),
    }))
    .filter((p) => p.sizes.length > 0);
  const weeksOff = (catalog.discounts ?? [])
    .filter((d) => d.kind === "duration" && d.percent > 0)
    .flatMap((d) => {
      const weeks = d.minWeeks ?? catalog.durations.find((x) => x.publicId === d.targetPublicId)?.weeks;
      return weeks == null ? [] : [{ weeks, percent: d.percent, label: d.minWeeks != null ? `${weeks} weeks or more` : `${weeks} weeks` }];
    })
    .sort((a, b) => a.weeks - b.weeks);
  return {
    currency,
    from: lowestRate(catalog),
    biggestOff: biggestDurationOff(catalog),
    weeksOff,
    free: deliveryIsFree(catalog),
    dropOff: paidDropOff(catalog),
    cutoff: catalog.cutoffHour != null ? hourLabel(catalog.cutoffHour) : null,
    areas: zones.map((z) => z.name).sort((a, b) => a.localeCompare(b)),
    runs: runsOf(zones).map((r) => ({ label: r.label, areas: r.zones.map((z) => z.name).sort((a, b) => a.localeCompare(b)) })),
    trial: trial ? { length: trialLength(trial), rate: trial.rate } : null,
    plans,
  };
}

export async function loadSiteFacts(): Promise<SiteFacts> {
  const [catalog, { currency }, trialSettings] = await Promise.all([loadCatalogSnapshot(), getAppSettings(), getTrialSettings()]);
  return buildFacts(catalog, currency, trialSettings);
}
