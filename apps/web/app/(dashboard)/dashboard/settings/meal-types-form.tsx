"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";
import { PLAN_TYPES } from "@/lib/menu/meal-types";
import { saveMealTypes, saveSlot, deleteSlot } from "./actions";

type SlotData = {
  id: string;
  planType: string;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
};

type NewSlot = {
  planType: PlanType;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
};

export function MealTypesForm({
  initial,
  slots,
}: {
  initial: MealTypesSettings;
  slots: SlotData[];
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<MealTypesSettings>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newSlots, setNewSlots] = useState<Record<PlanType, NewSlot>>({
    tiffin: { planType: "tiffin", key: "", label: "", enabled: true, sortOrder: 0 },
    healthy: { planType: "healthy", key: "", label: "", enabled: true, sortOrder: 0 },
  });

  const update = (t: PlanType, patch: Partial<MealTypesSettings[PlanType]>) =>
    setCfg((c) => ({ ...c, [t]: { ...c[t], ...patch } }));

  const saveTypes = () =>
    start(async () => {
      setError(null);
      try {
        await saveMealTypes(cfg);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });

  const handleSaveSlot = (slot: SlotData) =>
    start(async () => {
      setError(null);
      try {
        await saveSlot({
          id: slot.id,
          planType: slot.planType as PlanType,
          key: slot.key,
          label: slot.label,
          enabled: slot.enabled,
          sortOrder: slot.sortOrder,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });

  const handleDeleteSlot = (id: string) =>
    start(async () => {
      setError(null);
      try {
        await deleteSlot(id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });

  const handleAddSlot = (t: PlanType) =>
    start(async () => {
      setError(null);
      const ns = newSlots[t];
      if (!ns.key.trim() || !ns.label.trim()) {
        setError("Key and label are required");
        return;
      }
      try {
        await saveSlot({ id: null, ...ns });
        setNewSlots((prev) => ({
          ...prev,
          [t]: { planType: t, key: "", label: "", enabled: true, sortOrder: 0 },
        }));
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });

  const updateNew = (t: PlanType, patch: Partial<NewSlot>) =>
    setNewSlots((prev) => ({ ...prev, [t]: { ...prev[t], ...patch } }));

  return (
    <div className="space-y-8">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {PLAN_TYPES.map((t) => {
        const typeSlots = slots.filter((s) => s.planType === t);
        return (
          <div key={t} className="rounded-lg border p-4 space-y-4">
            <h3 className="font-medium capitalize">{t}</h3>

            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-sm">
                Title prefix
                <Input
                  value={cfg[t].titlePrefix}
                  onChange={(e) => update(t, { titlePrefix: e.target.value })}
                  className="mt-1"
                />
              </label>
              <label className="text-sm">
                Accent
                <Input
                  type="color"
                  value={cfg[t].accent}
                  onChange={(e) => update(t, { accent: e.target.value })}
                  className="mt-1 w-16 h-9 p-1 cursor-pointer"
                />
              </label>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Meal slots</p>

              {typeSlots.length === 0 && (
                <p className="text-muted-foreground text-sm">No slots yet.</p>
              )}

              {typeSlots.map((slot) => (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  onSave={handleSaveSlot}
                  onDelete={handleDeleteSlot}
                  disabled={pending}
                />
              ))}

              <div className="flex items-center gap-2 pt-2 border-t">
                <Input
                  placeholder="key (e.g. lunch)"
                  value={newSlots[t].key}
                  onChange={(e) => updateNew(t, { key: e.target.value.replace(/[^a-z0-9_-]/gi, "") })}
                  className="w-36"
                />
                <Input
                  placeholder="Label (e.g. Lunch)"
                  value={newSlots[t].label}
                  onChange={(e) => updateNew(t, { label: e.target.value })}
                  className="w-44"
                />
                <Input
                  type="number"
                  placeholder="Order"
                  value={newSlots[t].sortOrder}
                  onChange={(e) => updateNew(t, { sortOrder: Number(e.target.value) })}
                  className="w-20"
                />
                <Switch
                  checked={newSlots[t].enabled}
                  onCheckedChange={(v) => updateNew(t, { enabled: v })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => handleAddSlot(t)}
                >
                  Add slot
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      <Button onClick={saveTypes} disabled={pending}>
        Save meal types
      </Button>
    </div>
  );
}

function SlotRow({
  slot,
  onSave,
  onDelete,
  disabled,
}: {
  slot: SlotData;
  onSave: (s: SlotData) => void;
  onDelete: (id: string) => void;
  disabled: boolean;
}) {
  const [local, setLocal] = useState(slot);

  useEffect(() => { setLocal(slot); }, [slot]);

  const patch = (p: Partial<SlotData>) => setLocal((prev) => ({ ...prev, ...p }));

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="key"
        value={local.key}
        onChange={(e) => patch({ key: e.target.value.replace(/[^a-z0-9_-]/gi, "") })}
        className="w-36"
      />
      <Input
        placeholder="Label"
        value={local.label}
        onChange={(e) => patch({ label: e.target.value })}
        className="w-44"
      />
      <Input
        type="number"
        placeholder="Order"
        value={local.sortOrder}
        onChange={(e) => patch({ sortOrder: Number(e.target.value) })}
        className="w-20"
      />
      <Switch
        checked={local.enabled}
        onCheckedChange={(v) => patch({ enabled: v })}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onSave(local)}
      >
        Save
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive"
        disabled={disabled}
        onClick={() => onDelete(slot.id)}
      >
        Delete
      </Button>
    </div>
  );
}
