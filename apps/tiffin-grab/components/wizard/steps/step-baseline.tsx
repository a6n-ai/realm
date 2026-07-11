import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { selectablePlans } from "../plan-filter";
import { Card } from "@realm/ui/card";

export function StepBaseline({ catalog, selections, set }: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  return (
    <div className="grid gap-3">
      {selectablePlans(catalog).map((p) => (
        <Card
          key={p.key}
          role="button"
          onClick={() => {
            // Dish selection happens per-delivery after subscribing, not here —
            // mealSlots just mirrors the plan's full category set so pricing's
            // "at least one category" guard is satisfied.
            set({ planKey: p.key as WizardSelections["planKey"], mealSizeId: "", mealSlots: p.offeredSlots ?? [] });
          }}
          className={`cursor-pointer p-4 transition ${selections.planKey === p.key ? "ring-2 ring-primary" : "hover:bg-accent"}`}
        >
          <div className="font-medium">{p.name}</div>
          <div className="text-sm text-muted-foreground">{p.description}</div>
        </Card>
      ))}
    </div>
  );
}
