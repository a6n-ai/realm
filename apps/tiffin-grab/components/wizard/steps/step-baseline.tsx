import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { Card } from "@realm/ui/card";

export function StepBaseline({ catalog, selections, set }: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  return (
    <div className="grid gap-3">
      {catalog.plans.map((p) => (
        <Card
          key={p.key}
          role="button"
          onClick={() => {
            const offered = p.offeredSlots ?? [];
            const defaultSlots = p.planType === "tiffin" ? offered.slice(0, 1) : offered;
            set({ planKey: p.key as WizardSelections["planKey"], mealSizeId: "", mealSlots: defaultSlots });
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
