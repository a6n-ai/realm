import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import type { EnabledSlot, WizardSelections } from "../selections";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function StepSchedule({ catalog, selections, set, enabledSlots }: {
  catalog: ClientCatalogSnapshot;
  selections: WizardSelections;
  set: (patch: Partial<WizardSelections>) => void;
  enabledSlots: EnabledSlot[];
}) {
  const toggleSlot = (key: string, checked: boolean) => {
    const next = checked
      ? [...selections.mealSlots, key]
      : selections.mealSlots.filter((k) => k !== key);
    // Keep at least one slot selected; ignore an unchecking that would empty it.
    if (next.length === 0) return;
    set({ mealSlots: next });
  };

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
        <Label className="text-sm font-medium">Persons (1–5)</Label>
        <div className="mt-2 flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" onClick={() => set({ persons: Math.max(1, selections.persons - 1) })}>−</Button>
          <span className="w-8 text-center text-lg font-medium">{selections.persons}</span>
          <Button type="button" variant="outline" size="icon" onClick={() => set({ persons: Math.min(5, selections.persons + 1) })}>+</Button>
        </div>
      </div>

      {enabledSlots.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Meal slots</Label>
          {enabledSlots.map((slot) => (
            <label key={slot.key} className="flex items-center gap-2 rounded-md border p-3">
              <input
                type="checkbox"
                checked={selections.mealSlots.includes(slot.key)}
                onChange={(e) => toggleSlot(slot.key, e.target.checked)}
              />
              <span>{slot.label}</span>
            </label>
          ))}
        </div>
      )}

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
