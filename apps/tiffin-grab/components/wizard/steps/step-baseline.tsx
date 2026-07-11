import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { selectablePlans } from "../plan-filter";
import { Card } from "@realm/ui/card";
import { Check } from "lucide-react";

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
          className={`hover-lift cursor-pointer p-4 transition-[transform,box-shadow,background-color] active:scale-[0.99] ${selections.planKey === p.key ? "ring-2 ring-primary" : "hover:bg-accent"}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium">{p.name}</div>
            {selections.planKey === p.key && (
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
          </div>
          <div className="text-sm text-muted-foreground text-pretty">{p.description}</div>
        </Card>
      ))}
    </div>
  );
}
