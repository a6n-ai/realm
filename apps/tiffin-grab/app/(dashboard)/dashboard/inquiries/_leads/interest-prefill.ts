import type { OrderFormInput } from "../[id]/order-schema";

type PrefillCatalog = {
  plans: { key: string; name: string }[];
  mealSizes: { id: string; name: string }[];
  frequencies?: { key: string }[];
};
type InterestInput = {
  planInterest: string | null;
  mealSizeInterest: string | null;
  personsInterest: number | null;
  frequencyKeyInterest?: string | null;
  eatingDaysInterest?: string[] | null;
  preferredStart: string | null;
  postalCode: string | null;
  quotedPrice: string | null;
};

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Map inquiry interest → order form defaults.
 * Prefer plan.key / mealSize.publicId (catalog selects); fall back to name match for legacy free-text.
 */
export function interestToPrefill(
  inq: InterestInput,
  catalog: PrefillCatalog,
): { prefill: Partial<OrderFormInput>; unmatched: string[] } {
  const prefill: Partial<OrderFormInput> = {};
  const unmatched: string[] = [];

  if (inq.planInterest) {
    const byKey = catalog.plans.find((p) => p.key === inq.planInterest);
    const byName = catalog.plans.find((p) => eq(p.name, inq.planInterest!));
    const hit = byKey ?? byName;
    if (hit) prefill.planKey = hit.key;
    else unmatched.push(`Plan: ${inq.planInterest}`);
  }
  if (inq.mealSizeInterest) {
    const byId = catalog.mealSizes.find((m) => m.id === inq.mealSizeInterest);
    const byName = catalog.mealSizes.find((m) => eq(m.name, inq.mealSizeInterest!));
    const hit = byId ?? byName;
    if (hit) prefill.mealSizeId = hit.id;
    else unmatched.push(`Meal size: ${inq.mealSizeInterest}`);
  }
  if (inq.personsInterest != null) prefill.persons = inq.personsInterest;
  if (inq.frequencyKeyInterest) {
    if (!catalog.frequencies || catalog.frequencies.some((f) => f.key === inq.frequencyKeyInterest)) {
      prefill.frequencyKey = inq.frequencyKeyInterest;
    } else unmatched.push(`Delivery type: ${inq.frequencyKeyInterest}`);
  }
  if (inq.eatingDaysInterest?.length) prefill.eatingDays = inq.eatingDaysInterest as OrderFormInput["eatingDays"];
  if (inq.preferredStart) prefill.startDate = inq.preferredStart;
  if (inq.postalCode) prefill.postalCode = inq.postalCode;
  if (inq.quotedPrice) unmatched.push(`Quoted price: ${inq.quotedPrice}`);

  return { prefill, unmatched };
}
