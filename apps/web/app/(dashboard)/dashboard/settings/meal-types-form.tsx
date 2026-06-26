"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";
import { PLAN_TYPES } from "@/lib/menu/meal-types";
import { saveMealTypes, saveSlot, deleteSlot } from "./actions";

type SlotData = {
  id: string;
  planType: PlanType;
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
};

type NewSlotDraft = {
  key: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
};

const emptyDraft = (): NewSlotDraft => ({
  key: "",
  label: "",
  enabled: true,
  sortOrder: 0,
});

export function MealTypesForm({
  initial,
  slots,
}: {
  initial: MealTypesSettings;
  slots: SlotData[];
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<MealTypesSettings>(initial);
  const [typesPending, startTypes] = useTransition();
  const [typesError, setTypesError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<PlanType, NewSlotDraft>>({
    tiffin: emptyDraft(),
    healthy: emptyDraft(),
  });
  const [addPending, setAddPending] = useState<PlanType | null>(null);
  const [addErrors, setAddErrors] = useState<Record<PlanType, string | null>>({
    tiffin: null,
    healthy: null,
  });

  const refresh = () => router.refresh();

  const update = (t: PlanType, patch: Partial<MealTypesSettings[PlanType]>) =>
    setCfg((c) => ({ ...c, [t]: { ...c[t], ...patch } }));

  const patchDraft = (t: PlanType, patch: Partial<NewSlotDraft>) =>
    setDrafts((prev) => ({ ...prev, [t]: { ...prev[t], ...patch } }));

  const handleSaveTypes = () =>
    startTypes(async () => {
      setTypesError(null);
      try {
        await saveMealTypes(cfg);
        refresh();
      } catch (e) {
        setTypesError(e instanceof Error ? e.message : "Save failed");
      }
    });

  const handleAddSlot = async (t: PlanType) => {
    const draft = drafts[t];
    if (!draft.key.trim() || !draft.label.trim()) {
      setAddErrors((prev) => ({ ...prev, [t]: "Key and label are required" }));
      return;
    }
    setAddPending(t);
    setAddErrors((prev) => ({ ...prev, [t]: null }));
    try {
      await saveSlot({ id: null, planType: t, ...draft });
      setDrafts((prev) => ({ ...prev, [t]: emptyDraft() }));
      refresh();
    } catch (e) {
      setAddErrors((prev) => ({
        ...prev,
        [t]: e instanceof Error ? e.message : "Save failed",
      }));
    } finally {
      setAddPending(null);
    }
  };

  return (
    <div className="space-y-5">
      {PLAN_TYPES.map((t) => {
        const planSlots = slots.filter((s) => s.planType === t);
        const accent = cfg[t].accent;

        return (
          <div
            key={t}
            className="rounded-xl border-l-[3px] bg-muted/30 p-4 space-y-4"
            style={{ borderLeftColor: accent }}
          >
            <div className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: accent }}
                aria-hidden
              />
              <h3 className="font-semibold capitalize text-balance">{t}</h3>
            </div>

            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Title prefix</Label>
                <Input
                  value={cfg[t].titlePrefix}
                  onChange={(e) => update(t, { titlePrefix: e.target.value })}
                  className="h-10 w-52"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">Accent colour</Label>
                <input
                  type="color"
                  value={cfg[t].accent}
                  onChange={(e) => update(t, { accent: e.target.value })}
                  className="h-10 w-16 cursor-pointer rounded-lg border border-input bg-transparent p-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Meal slots
              </p>

              {planSlots.length === 0 && (
                <p className="text-muted-foreground text-sm py-1">No slots yet.</p>
              )}

              {planSlots.map((slot) => (
                <SlotRow key={slot.id} slot={slot} onDone={refresh} />
              ))}

              <div className="mt-1 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border/60 bg-background/60 p-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Key</Label>
                  <Input
                    placeholder="e.g. lunch"
                    value={drafts[t].key}
                    onChange={(e) =>
                      patchDraft(t, { key: e.target.value.replace(/[^a-z0-9_]/g, "") })
                    }
                    className="h-10 w-32"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Label</Label>
                  <Input
                    placeholder="e.g. Lunch"
                    value={drafts[t].label}
                    onChange={(e) => patchDraft(t, { label: e.target.value })}
                    className="h-10 w-40"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Order</Label>
                  <Input
                    type="number"
                    value={drafts[t].sortOrder}
                    onChange={(e) => patchDraft(t, { sortOrder: Number(e.target.value) })}
                    className="h-10 w-20 tabular-nums"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">Enabled</Label>
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={drafts[t].enabled}
                      onCheckedChange={(v) => patchDraft(t, { enabled: v })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  {addErrors[t] && (
                    <p className="text-destructive text-xs">{addErrors[t]}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-10 gap-1.5 active:scale-[0.96] transition-transform"
                    disabled={addPending === t}
                    onClick={() => handleAddSlot(t)}
                  >
                    <PlusIcon className="size-3.5" />
                    Add slot
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={handleSaveTypes}
          disabled={typesPending}
          className="h-10 gap-2 active:scale-[0.96] transition-transform"
        >
          <SaveIcon className="size-4" />
          Save meal types
        </Button>
        {typesError && <p className="text-destructive text-sm">{typesError}</p>}
      </div>
    </div>
  );
}

function SlotRow({
  slot,
  onDone,
}: {
  slot: SlotData;
  onDone: () => void;
}) {
  const [local, setLocal] = useState(slot);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLocal({
      id: slot.id,
      planType: slot.planType,
      key: slot.key,
      label: slot.label,
      enabled: slot.enabled,
      sortOrder: slot.sortOrder,
    });
  }, [slot.id, slot.planType, slot.key, slot.label, slot.enabled, slot.sortOrder]);

  const patch = (p: Partial<SlotData>) =>
    setLocal((prev) => ({ ...prev, ...p }));

  const handleSave = () =>
    start(async () => {
      setError(null);
      try {
        await saveSlot({
          id: local.id,
          planType: local.planType,
          key: local.key,
          label: local.label,
          enabled: local.enabled,
          sortOrder: local.sortOrder,
        });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
      }
    });

  const handleDelete = () =>
    start(async () => {
      setError(null);
      try {
        await deleteSlot(slot.id);
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed");
      }
    });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-background/80 p-2">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Key</Label>
        <Input
          placeholder="key"
          value={local.key}
          onChange={(e) =>
            patch({ key: e.target.value.replace(/[^a-z0-9_]/g, "") })
          }
          className="h-10 w-32"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Label</Label>
        <Input
          placeholder="Label"
          value={local.label}
          onChange={(e) => patch({ label: e.target.value })}
          className="h-10 w-40"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Order</Label>
        <Input
          type="number"
          value={local.sortOrder}
          onChange={(e) => patch({ sortOrder: Number(e.target.value) })}
          className="h-10 w-20 tabular-nums"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Enabled</Label>
        <div className="flex h-10 items-center">
          <Switch
            checked={local.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {error && <p className="text-destructive text-xs">{error}</p>}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 gap-1.5 active:scale-[0.96] transition-transform"
            disabled={pending}
            onClick={handleSave}
          >
            <SaveIcon className="size-3.5" />
            Save
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-10 w-10 p-0 text-destructive hover:text-destructive active:scale-[0.96] transition-transform"
            disabled={pending}
            onClick={handleDelete}
            aria-label="Delete slot"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
