import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog, type ClientCatalogSnapshot } from "@/lib/catalog/types";
import { checkoutHolidayDates } from "@/lib/services/holidays.service";
import { popularMealSizesByPlan } from "@/lib/services/popular-meal-sizes.service";
import { appToday, earliestPlanStart, planStartDays } from "@/lib/services/start-date";
import { getTrialSettings } from "@/lib/services/trial-settings.service";
import type { WizardSelections } from "@/lib/wizard/selections";

// What the plan builder needs that is the same for every visitor, signed in or not: /subscribe (signed out)
// and /me/renew (signed in, plus the customer's own extras) both build the wizard from this.
export async function loadBuilderInputs(orgId: string | null) {
  const [catalog, trialSettings, popular] = await Promise.all([loadCatalogSnapshot(), getTrialSettings(orgId), popularMealSizesByPlan(orgId)]);
  const client = toClientCatalog(catalog);
  const today = appToday(client.timezone, client.cutoffHour);
  const holidayDates = await checkoutHolidayDates(today.toISOString().slice(0, 10));
  const trial = trialSettings.maxDays != null && trialSettings.maxDays >= 1 && trialSettings.weekdays.length > 0 ? { maxDays: trialSettings.maxDays, weekdays: trialSettings.weekdays } : null;
  return { catalog, client, today, holidayDates, popular, trial };
}

/** The picks with the first start date the plan may take (after `earliestStart`, never a holiday). */
export function withFirstStart(client: ClientCatalogSnapshot, base: WizardSelections, today: Date, earliestStart: string | null, holidayDates: string[]): WizardSelections {
  const plan = client.plans.find((p) => p.key === base.planKey);
  if (!plan) return base;
  const weekdays = client.frequencies.find((f) => f.key === base.frequencyKey)?.weekdays;
  return { ...base, startDate: earliestPlanStart(today, planStartDays(plan.allowedStartDays, weekdays), earliestStart, new Set(holidayDates)) };
}
