import type { OrderFormInput } from "../[id]/order-schema";

type PrefillCatalog = { plans: { key: string; name: string }[]; mealSizes: { id: string; name: string }[] };
type InterestInput = {
  planInterest: string | null; mealSizeInterest: string | null; personsInterest: number | null;
  preferredStart: string | null; postalCode: string | null; quotedPrice: string | null;
};

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function interestToPrefill(inq: InterestInput, catalog: PrefillCatalog): {
  prefill: Partial<OrderFormInput>; unmatched: string[];
} {
  const prefill: Partial<OrderFormInput> = {};
  const unmatched: string[] = [];

  if (inq.planInterest) {
    const hit = catalog.plans.find((p) => eq(p.name, inq.planInterest!));
    if (hit) prefill.planKey = hit.key;
    else unmatched.push(`Plan: ${inq.planInterest}`);
  }
  if (inq.mealSizeInterest) {
    const hit = catalog.mealSizes.find((m) => eq(m.name, inq.mealSizeInterest!));
    if (hit) prefill.mealSizeId = hit.id;
    else unmatched.push(`Meal size: ${inq.mealSizeInterest}`);
  }
  if (inq.personsInterest != null) prefill.persons = inq.personsInterest;
  if (inq.preferredStart) prefill.startDate = inq.preferredStart;
  if (inq.postalCode) prefill.postalCode = inq.postalCode;
  if (inq.quotedPrice) unmatched.push(`Quoted price: ${inq.quotedPrice}`);

  return { prefill, unmatched };
}
