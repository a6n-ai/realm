"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Skeleton } from "@realm/ui/skeleton";
import { Switch } from "@realm/ui/switch";
import { cn } from "@realm/ui/cn";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";
import { PLAN_TYPES } from "@/lib/menu/meal-types";
import { saveMealTypes, saveSlot, deleteSlot } from "./actions";

const PLAN_FIELDS = {
  titlePrefix: { label: "Title prefix", width: "w-52" },
  accent: { label: "Accent colour", width: "w-16" },
} as const;

const SLOT_FIELDS = [
  { name: "key", label: "Key", width: "w-32", kind: "input" },
  { name: "label", label: "Label", width: "w-40", kind: "input" },
  { name: "sortOrder", label: "Order", width: "w-20", kind: "input" },
  { name: "enabled", label: "Enabled", width: "w-11", kind: "switch" },
  { name: "selectable", label: "Selectable", width: "w-11", kind: "switch" },
] as const;

const SF = Object.fromEntries(SLOT_FIELDS.map((f) => [f.name, f])) as Record<
  (typeof SLOT_FIELDS)[number]["name"],
  (typeof SLOT_FIELDS)[number]
>;

type SlotData = {
  id: string;
  planType: PlanType;
  key: string;
  label: string;
  enabled: boolean;
  selectable: boolean;
  sortOrder: number;
};

type NewSlotDraft = {
  key: string;
  label: string;
  enabled: boolean;
  selectable: boolean;
  sortOrder: number;
};

const emptyDraft = (): NewSlotDraft => ({
  key: "",
  label: "",
  enabled: true,
  selectable: false,
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
            className="rounded-xl border bg-muted/30 p-4 space-y-4"
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
                <Label className="text-xs text-muted-foreground">{PLAN_FIELDS.titlePrefix.label}</Label>
                <Input
                  value={cfg[t].titlePrefix}
                  onChange={(e) => update(t, { titlePrefix: e.target.value })}
                  className={cn("h-10", PLAN_FIELDS.titlePrefix.width)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{PLAN_FIELDS.accent.label}</Label>
                <input
                  type="color"
                  value={cfg[t].accent}
                  onChange={(e) => update(t, { accent: e.target.value })}
                  className={cn(
                    "h-10 cursor-pointer rounded-lg border border-input bg-transparent p-1",
                    PLAN_FIELDS.accent.width,
                  )}
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Dish categories
              </p>

              {planSlots.length === 0 && (
                <p className="text-muted-foreground text-sm py-1">No categories yet.</p>
              )}

              {planSlots.map((slot) => (
                <SlotRow key={slot.id} slot={slot} onDone={refresh} />
              ))}

              <div className="mt-1 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border/60 bg-background/60 p-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{SF.key.label}</Label>
                  <Input
                    placeholder="e.g. lunch"
                    value={drafts[t].key}
                    onChange={(e) =>
                      patchDraft(t, { key: e.target.value.replace(/[^a-z0-9_]/g, "") })
                    }
                    className={cn("h-10", SF.key.width)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{SF.label.label}</Label>
                  <Input
                    placeholder="e.g. Lunch"
                    value={drafts[t].label}
                    onChange={(e) => patchDraft(t, { label: e.target.value })}
                    className={cn("h-10", SF.label.width)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{SF.sortOrder.label}</Label>
                  <Input
                    type="number"
                    value={drafts[t].sortOrder}
                    onChange={(e) => patchDraft(t, { sortOrder: Number(e.target.value) })}
                    className={cn("h-10 tabular-nums", SF.sortOrder.width)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{SF.enabled.label}</Label>
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={drafts[t].enabled}
                      onCheckedChange={(v) => patchDraft(t, { enabled: v })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs text-muted-foreground">{SF.selectable.label}</Label>
                  <div className="flex h-10 items-center">
                    <Switch
                      checked={drafts[t].selectable}
                      onCheckedChange={(v) => patchDraft(t, { selectable: v })}
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
                    Add category
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
      selectable: slot.selectable,
      sortOrder: slot.sortOrder,
    });
  }, [slot.id, slot.planType, slot.key, slot.label, slot.enabled, slot.selectable, slot.sortOrder]);

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
          selectable: local.selectable,
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
        <Label className="text-xs text-muted-foreground">{SF.key.label}</Label>
        <Input
          placeholder="key"
          value={local.key}
          onChange={(e) =>
            patch({ key: e.target.value.replace(/[^a-z0-9_]/g, "") })
          }
          className={cn("h-10", SF.key.width)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{SF.label.label}</Label>
        <Input
          placeholder="Label"
          value={local.label}
          onChange={(e) => patch({ label: e.target.value })}
          className={cn("h-10", SF.label.width)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{SF.sortOrder.label}</Label>
        <Input
          type="number"
          value={local.sortOrder}
          onChange={(e) => patch({ sortOrder: Number(e.target.value) })}
          className={cn("h-10 tabular-nums", SF.sortOrder.width)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{SF.enabled.label}</Label>
        <div className="flex h-10 items-center">
          <Switch
            checked={local.enabled}
            onCheckedChange={(v) => patch({ enabled: v })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">{SF.selectable.label}</Label>
        <div className="flex h-10 items-center">
          <Switch
            checked={local.selectable}
            onCheckedChange={(v) => patch({ selectable: v })}
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

function SlotFieldsSkeleton() {
  return (
    <>
      {SLOT_FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">{f.label}</Label>
          {f.kind === "switch" ? (
            <div className="flex h-10 items-center">
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          ) : (
            <Skeleton className={cn("h-10", f.width)} />
          )}
        </div>
      ))}
    </>
  );
}

export function MealTypesFormSkeleton() {
  return (
    <div className="space-y-5">
      {PLAN_TYPES.map((t) => (
        <div key={t} className="rounded-xl border bg-muted/30 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Skeleton className="size-3 shrink-0 rounded-full" />
            <Skeleton className="h-5 w-20" />
          </div>

          <div className="flex flex-wrap gap-4 items-end">
            {Object.entries(PLAN_FIELDS).map(([name, f]) => (
              <div key={name} className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{f.label}</Label>
                <Skeleton className={cn("h-10", f.width)} />
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Dish categories
            </p>

            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-wrap items-end gap-3 rounded-lg bg-background/80 p-2"
              >
                <SlotFieldsSkeleton />
                <div className="flex flex-col gap-1.5">
                  <div className="flex gap-2">
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-10 w-10" />
                  </div>
                </div>
              </div>
            ))}

            <div className="mt-1 flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border/60 bg-background/60 p-3">
              <SlotFieldsSkeleton />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-10 w-24" />
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  );
}
