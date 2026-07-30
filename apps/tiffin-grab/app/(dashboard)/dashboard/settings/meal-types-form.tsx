"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SaveIcon, } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Skeleton } from "@realm/ui/skeleton";
import { cn } from "@realm/ui/cn";
import type { MealTypesSettings, PlanType } from "@/lib/menu/meal-types";
import { PLAN_TYPES } from "@/lib/menu/meal-types";
import { saveMealTypes } from "./actions";

const PLAN_FIELDS = {
  titlePrefix: { label: "Title prefix", width: "w-52" },
  accent: { label: "Accent colour", width: "w-16" },
} as const;


export function MealTypesForm({
  initial,
}: {
  initial: MealTypesSettings;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<MealTypesSettings>(initial);
  const [typesPending, startTypes] = useTransition();
  const [typesError, setTypesError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const update = (t: PlanType, patch: Partial<MealTypesSettings[PlanType]>) =>
    setCfg((c) => ({ ...c, [t]: { ...c[t], ...patch } }));


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


  return (
    <div className="space-y-5">
      {PLAN_TYPES.map((t) => {
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
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  );
}
