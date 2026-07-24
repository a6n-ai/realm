"use client";

import { cn } from "@realm/ui/cn";
import { FormItem, FormLabel, FormMessage } from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import type { ZoneLike } from "@/lib/catalog/postal";
import { PostalCombobox } from "./postal-combobox";

export type InterestCatalog = {
  plans: { key: string; name: string }[];
  /** `diet` is the plan key (same shape as OrderForm catalog). */
  mealSizes: { id: string; name: string; diet: string }[];
};

/** Short pill label — Veg / Non-veg / Healthy from catalog plan names. */
export function planPillLabel(name: string): string {
  const n = name.toLowerCase();
  if (/\bnon[\s-]?veg/.test(n) || n.includes("nonveg")) return "Non-veg";
  if (n.includes("healthy")) return "Healthy";
  if (n.includes("veg")) return "Veg";
  return name;
}

export function labelPlanInterest(
  value: string | null | undefined,
  catalog: InterestCatalog,
): string | null {
  if (!value) return null;
  const byKey = catalog.plans.find((p) => p.key === value);
  if (byKey) return byKey.name;
  const byName = catalog.plans.find((p) => p.name.toLowerCase() === value.trim().toLowerCase());
  return byName?.name ?? value;
}

export function labelMealInterest(
  value: string | null | undefined,
  catalog: InterestCatalog,
): string | null {
  if (!value) return null;
  const byId = catalog.mealSizes.find((m) => m.id === value);
  if (byId) return byId.name;
  const byName = catalog.mealSizes.find((m) => m.name.toLowerCase() === value.trim().toLowerCase());
  return byName?.name ?? value;
}

type InterestValues = {
  planInterest?: string;
  mealSizeInterest?: string;
  personsInterest?: number | "";
  postalCode?: string;
  preferredStart?: string;
  quotedPrice?: number | "";
};

function PillRow({
  label,
  options,
  value,
  onChange,
  disabled,
  emptyHint,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  emptyHint?: string;
}) {
  return (
    <FormItem className="grid gap-2 sm:col-span-2">
      <FormLabel>{label}</FormLabel>
      {options.length === 0 ? (
        <p className="text-muted-foreground text-sm">{emptyHint ?? "Nothing to pick yet."}</p>
      ) : (
        <div
          role="radiogroup"
          aria-label={label}
          className={cn("flex flex-wrap gap-2", disabled && "pointer-events-none opacity-50")}
        >
          {options.map((opt) => {
            const active = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange(opt.value)}
                className={cn(
                  "min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
                  active
                    ? "border-primary/30 bg-primary/12 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
      <FormMessage />
    </FormItem>
  );
}

/**
 * Plan + meal-size picker — diet pills first, then meal-size pills (no dropdowns).
 */
export function PlanMealPicker({
  catalog,
  planKey,
  mealSizeId,
  onPlanChange,
  onMealChange,
  planRequired,
}: {
  catalog: InterestCatalog;
  planKey: string;
  mealSizeId: string;
  onPlanChange: (planKey: string) => void;
  onMealChange: (mealSizeId: string) => void;
  planRequired?: boolean;
}) {
  const meals = planKey
    ? catalog.mealSizes.filter((m) => m.diet === planKey)
    : [];
  const planOptions = catalog.plans.map((p) => ({
    value: p.key,
    label: planPillLabel(p.name),
  }));
  const mealOptions = meals.map((m) => ({ value: m.id, label: m.name }));

  const pickPlan = (key: string) => {
    onPlanChange(key);
    const nextMeals = catalog.mealSizes.filter((m) => m.diet === key);
    if (!nextMeals.some((m) => m.id === mealSizeId)) {
      onMealChange(nextMeals[0]?.id ?? "");
    }
  };

  return (
    <>
      <PillRow
        label={planRequired ? "Diet *" : "Diet"}
        options={planOptions}
        value={planKey}
        onChange={pickPlan}
      />
      {planKey ? (
        <PillRow
          label={planRequired ? "Meal size *" : "Meal size"}
          options={mealOptions}
          value={mealSizeId}
          onChange={onMealChange}
          emptyHint="No meal sizes for this plan."
        />
      ) : null}
    </>
  );
}

/** Catalog-backed interest fields (plan/meal + optional quote/postal/start). */
export function PlanInterestFields({
  catalog,
  zones,
  values,
  onChange,
}: {
  catalog: InterestCatalog;
  zones: ZoneLike[];
  values: InterestValues;
  onChange: (patch: Partial<InterestValues>) => void;
}) {
  const planKey = values.planInterest ?? "";

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <PlanMealPicker
        catalog={catalog}
        planKey={planKey}
        mealSizeId={values.mealSizeInterest ?? ""}
        onPlanChange={(key) => {
          const nextMeals = catalog.mealSizes.filter((m) => m.diet === key);
          const mealStillValid = nextMeals.some((m) => m.id === values.mealSizeInterest);
          onChange({
            planInterest: key,
            mealSizeInterest: mealStillValid ? values.mealSizeInterest : "",
          });
        }}
        onMealChange={(id) => onChange({ mealSizeInterest: id })}
      />

      <FormItem className="grid gap-1.5">
        <FormLabel>Persons</FormLabel>
        <Input
          className="nums min-h-11"
          type="number"
          min={1}
          max={20}
          placeholder="1"
          value={values.personsInterest ?? ""}
          onChange={(e) =>
            onChange({
              personsInterest: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
        />
      </FormItem>

      <FormItem className="grid gap-1.5">
        <FormLabel>Quoted price</FormLabel>
        <Input
          className="nums min-h-11"
          type="number"
          min={0}
          step="0.01"
          placeholder="0.00"
          value={values.quotedPrice ?? ""}
          onChange={(e) =>
            onChange({
              quotedPrice: e.target.value === "" ? "" : Number(e.target.value),
            })
          }
        />
      </FormItem>

      <FormItem className="grid gap-1.5 sm:col-span-2">
        <FormLabel>Postal code</FormLabel>
        <PostalCombobox
          value={values.postalCode ?? ""}
          onChange={(v) => onChange({ postalCode: v })}
          zones={zones}
        />
      </FormItem>

      <FormItem className="grid gap-1.5 sm:col-span-2">
        <FormLabel>Preferred start</FormLabel>
        <Input
          className="min-h-11"
          type="date"
          value={values.preferredStart ?? ""}
          onChange={(e) => onChange({ preferredStart: e.target.value })}
        />
      </FormItem>
    </div>
  );
}
