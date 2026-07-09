import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@realm/ui/radio-group";
import { Label } from "@realm/ui/label";
import { Button } from "@realm/ui/button";

export function StepSchedule({ catalog, selections, set }: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <Label className="text-sm font-medium">Delivery frequency</Label>
        <RadioGroup
          className="mt-2 grid gap-2"
          value={selections.frequencyKey}
          onValueChange={(v) => set({ frequencyKey: v as WizardSelections["frequencyKey"] })}
        >
          {catalog.frequencies.map((f) => (
            <div key={f.key} className="flex items-center gap-2 rounded-md border p-3">
              <RadioGroupItem id={f.key} value={f.key} />
              <Label htmlFor={f.key} className="flex-1">{f.name}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label className="text-sm font-medium">Persons (1–5)</Label>
        <div className="mt-2 flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => set({ persons: Math.max(1, selections.persons - 1) })}>−</Button>
          <span className="w-8 text-center text-lg font-medium">{selections.persons}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => set({ persons: Math.min(5, selections.persons + 1) })}>+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Weekend delivery</Label>
        <label className="flex items-center gap-2 rounded-md border p-3">
          <input type="checkbox" checked={selections.includeSaturday} onChange={(e) => set({ includeSaturday: e.target.checked })} />
          <span>Include Saturday</span>
        </label>
        <label className="flex items-center gap-2 rounded-md border p-3">
          <input type="checkbox" checked={selections.includeSunday} onChange={(e) => set({ includeSunday: e.target.checked })} />
          <span>Include Sunday</span>
        </label>
      </div>
    </div>
  );
}
