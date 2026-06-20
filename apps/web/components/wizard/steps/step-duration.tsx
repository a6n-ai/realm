import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Invoice } from "../invoice";

export function StepDuration({ catalog, selections, set, result }: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  result: PricingResult | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Commitment duration</Label>
        <RadioGroup
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5"
          value={String(selections.durationWeeks)}
          onValueChange={(v) => set({ durationWeeks: Number(v) })}
        >
          {catalog.durations.map((d) => (
            <div key={d.weeks} className="flex items-center gap-2 rounded-md border p-3">
              <RadioGroupItem id={`d${d.weeks}`} value={String(d.weeks)} />
              <Label htmlFor={`d${d.weeks}`}>{d.weeks}wk{d.discountPct > 0 ? ` (${d.discountPct}%)` : ""}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
      <Invoice result={result} />
    </div>
  );
}
