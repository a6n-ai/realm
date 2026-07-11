import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

// A plan is offered in the wizard only when its plan_type has at least one
// diet-compatible meal size. Meal sizes are scoped by plan_type, so a plan type
// with no sizes (e.g. Healthy, which ships no meal sizes) is hidden — no order
// can be created for it. A "veg" plan additionally needs a veg/both size, since
// nonveg sizes are never shown for it (mirrors StepBundle's visibleFor).
export function selectablePlans(catalog: ClientCatalogSnapshot): ClientCatalogSnapshot["plans"] {
  return catalog.plans.filter((p) =>
    catalog.mealSizes.some((m) => m.planType === p.planType && !(p.key === "veg" && m.diet === "nonveg")),
  );
}
