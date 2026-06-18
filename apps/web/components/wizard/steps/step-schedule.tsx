import type { CatalogSnapshot } from "@/lib/catalog/types";
import type { WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function StepSchedule({ catalog, selections, set }: {
  catalog: CatalogSnapshot;
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
              <Label htmlFor={f.key} className="flex-1">{f.name}{f.courierDiscountPct > 0 ? ` · ${f.courierDiscountPct}% courier discount` : ""}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      <div>
        <Label className="text-sm font-medium">Daily tiffins (1–5)</Label>
        <div className="mt-2 flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => set({ dailyQty: Math.max(1, selections.dailyQty - 1) })}>−</Button>
          <span className="w-8 text-center text-lg font-medium">{selections.dailyQty}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => set({ dailyQty: Math.min(5, selections.dailyQty + 1) })}>+</Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">Weekend add-ons (+$15/wk each)</Label>
        <label className="flex items-center gap-2 rounded-md border p-3">
          <input type="checkbox" checked={selections.includeSaturday} onChange={(e) => set({ includeSaturday: e.target.checked })} />
          <span>Include Saturday (Biryanis & Pulaos)</span>
        </label>
        <label className="flex items-center gap-2 rounded-md border p-3">
          <input type="checkbox" checked={selections.includeSunday} onChange={(e) => set({ includeSunday: e.target.checked })} />
          <span>Include Sunday (Curries & Parathas)</span>
        </label>
      </div>

      <label className="flex items-center gap-2 rounded-md border p-3">
        <input type="checkbox" checked={selections.isStudent} onChange={(e) => set({ isStudent: e.target.checked })} />
        <span>Student / newcomer household (10% credit)</span>
      </label>
    </div>
  );
}
