import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

// A plan is offered in the wizard only when at least one meal size is scoped to
// it (by planKey). A plan with no sizes (e.g. Healthy, which ships none) is
// hidden — no order can be created for it.
export function selectablePlans(catalog: ClientCatalogSnapshot): ClientCatalogSnapshot["plans"] {
  return catalog.plans.filter((p) => catalog.mealSizes.some((m) => m.planKey === p.key));
}
