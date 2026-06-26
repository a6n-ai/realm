"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";
import { PLAN_TYPES } from "@/lib/menu/meal-types";
import { saveMealTypes } from "./actions";

export function MealTypesForm({ initial }: { initial: MealTypesSettings }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<MealTypesSettings>(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (t: PlanType, patch: Partial<MealTypesSettings[PlanType]>) =>
    setCfg((c) => ({ ...c, [t]: { ...c[t], ...patch } }));
  const setSlot = (t: PlanType, i: number, patch: Partial<{ key: string; label: string }>) =>
    setCfg((c) => ({ ...c, [t]: { ...c[t], slots: c[t].slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) } }));
  const addSlot = (t: PlanType) => setCfg((c) => ({ ...c, [t]: { ...c[t], slots: [...c[t].slots, { key: "", label: "" }] } }));
  const removeSlot = (t: PlanType, i: number) => setCfg((c) => ({ ...c, [t]: { ...c[t], slots: c[t].slots.filter((_, j) => j !== i) } }));

  const save = () => start(async () => {
    setError(null);
    try { await saveMealTypes(cfg); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Save failed"); }
  });

  return (
    <div className="space-y-8">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {PLAN_TYPES.map((t) => (
        <div key={t} className="rounded-lg border p-4 space-y-3">
          <h3 className="font-medium capitalize">{t}</h3>
          <div className="flex flex-wrap gap-3">
            <label className="text-sm">Title prefix
              <Input value={cfg[t].titlePrefix} onChange={(e) => update(t, { titlePrefix: e.target.value })} />
            </label>
            <label className="text-sm">Accent
              <Input type="color" value={cfg[t].accent} onChange={(e) => update(t, { accent: e.target.value })} />
            </label>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Meal slots</p>
            {cfg[t].slots.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input placeholder="key (e.g. lunch)" value={s.key} onChange={(e) => setSlot(t, i, { key: e.target.value })} className="w-40" />
                <Input placeholder="Label (e.g. Lunch)" value={s.label} onChange={(e) => setSlot(t, i, { label: e.target.value })} className="w-48" />
                <button className="text-xs text-destructive" onClick={() => removeSlot(t, i)}>remove</button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => addSlot(t)}>+ slot</Button>
          </div>
        </div>
      ))}
      <Button onClick={save} disabled={pending}>Save meal types</Button>
    </div>
  );
}
