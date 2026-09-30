"use client";

import { useEffect, useState } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { mealPlanKey, type CustomMealItem } from "@/lib/custom-meal/composition";
import { previewCustomMeal } from "./actions";

export type CustomMealCategory = {
  key: string;
  label: string;
  tuUnitType: "weight" | "count";
  tuUnitSize: number;
  tuUnitLabel: string;
};

export type CustomMealValue = { items: CustomMealItem[]; basePriceOverride: number | null };

type Diet = "veg" | "non-veg";

const WEIGHT_SIZES = [8, 12, 16];
const DIETS: { value: Diet; label: string }[] = [
  { value: "veg", label: "Veg" },
  { value: "non-veg", label: "Non-Veg" },
];

const pillClass = (active: boolean) =>
  cn(
    "min-h-11 rounded-full border px-3.5 py-2 text-sm font-medium transition-[color,background-color,border-color,transform] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.96]",
    active
      ? "border-primary/30 bg-primary/12 text-primary"
      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
  );

/** Items with a positive portion — an emptied count input leaves a 0 row behind. */
export function filledItems(items: CustomMealItem[]): CustomMealItem[] {
  return items.filter((i) => i.tuAmount > 0);
}

export function CustomMealBuilder({
  categories,
  value,
  onChange,
}: {
  categories: CustomMealCategory[];
  value: CustomMealValue;
  onChange: (v: CustomMealValue) => void;
}) {
  const [diet, setDiet] = useState<Diet>(() => mealPlanKey(value.items));
  const [preview, setPreview] = useState<{ name: string; perTiffin: number } | { error: string } | null>(null);
  const byKey = new Map(categories.map((c) => [c.key, c]));

  const setItems = (items: CustomMealItem[]) => onChange({ ...value, items });
  const newItem = (c: CustomMealCategory, planKey: Diet): CustomMealItem => ({
    category: c.key,
    planKey,
    // Default portion is one TU: 8oz for weight, a unit pack (e.g. 4 roti) for count.
    tuAmount: c.tuUnitType === "weight" ? WEIGHT_SIZES[0]! / c.tuUnitSize : 1,
  });

  const changeDiet = (next: Diet) => {
    setDiet(next);
    // Veg forces every row veg; Non-Veg moves count rows to the meal diet and leaves weight picks as chosen.
    setItems(value.items.map((i) =>
      next === "veg" || byKey.get(i.category)?.tuUnitType === "count" ? { ...i, planKey: next } : i));
  };

  const updateAt = (idx: number, patch: Partial<CustomMealItem>) =>
    setItems(value.items.map((i, n) => (n === idx ? { ...i, ...patch } : i)));

  const itemsKey = JSON.stringify(filledItems(value.items));
  const override = value.basePriceOverride;
  useEffect(() => {
    const items = JSON.parse(itemsKey) as CustomMealItem[];
    if (items.length === 0) return;
    let cancelled = false;
    const t = setTimeout(() => {
      previewCustomMeal(items, override)
        .then((r) => { if (!cancelled) setPreview(r); })
        .catch(() => { if (!cancelled) setPreview({ error: "Couldn't price this meal" }); });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [itemsKey, override]);

  const hasItems = itemsKey !== "[]";

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <div className="grid gap-2">
        <Label>Meal diet</Label>
        <div role="radiogroup" aria-label="Meal diet" className="flex flex-wrap gap-2">
          {DIETS.map((d) => (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={diet === d.value}
              onClick={() => changeDiet(d.value)}
              className={pillClass(diet === d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        <Label>Items</Label>
        {value.items.map((item, idx) => {
          const cat = byKey.get(item.category);
          const natural = cat ? Math.round(item.tuAmount * cat.tuUnitSize * 10) / 10 : 0;
          return (
            <div key={idx} className="flex flex-wrap items-center gap-2">
              <Select
                value={item.category}
                onValueChange={(key) => {
                  const next = byKey.get(key);
                  if (next) updateAt(idx, newItem(next, next.tuUnitType === "count" ? diet : (item.planKey as Diet)));
                }}
              >
                <SelectTrigger aria-label="Category" className="min-h-11 min-w-32 flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>

              {diet === "non-veg" && cat?.tuUnitType === "weight" && (
                <Select value={item.planKey} onValueChange={(v) => updateAt(idx, { planKey: v })}>
                  <SelectTrigger aria-label="Item diet" className="min-h-11 w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIETS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}

              {cat?.tuUnitType === "count" ? (
                <div className="flex items-center gap-1.5">
                  <Input
                    aria-label={`${cat.label} count`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    className="min-h-11 w-20"
                    value={natural ? String(natural) : ""}
                    onChange={(e) => {
                      const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      updateAt(idx, { tuAmount: n / cat.tuUnitSize });
                    }}
                  />
                  <span className="text-muted-foreground text-sm">{cat.tuUnitLabel}</span>
                </div>
              ) : cat ? (
                <Select
                  value={String(natural)}
                  onValueChange={(v) => updateAt(idx, { tuAmount: Number(v) / cat.tuUnitSize })}
                >
                  <SelectTrigger aria-label="Portion" className="min-h-11 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WEIGHT_SIZES.map((oz) => (
                      <SelectItem key={oz} value={String(oz)}>{oz}{cat.tuUnitLabel}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove item"
                className="size-11 sm:size-9"
                onClick={() => setItems(value.items.filter((_, n) => n !== idx))}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          );
        })}
        <Button
          type="button"
          variant="outline"
          className="min-h-11 justify-self-start sm:min-h-9"
          disabled={categories.length === 0}
          onClick={() => setItems([...value.items, newItem(categories[0]!, diet)])}
        >
          <PlusIcon className="size-4" /> Add item
        </Button>
      </div>

      <div aria-live="polite" className="bg-muted/50 rounded-lg p-3 text-sm">
        {!hasItems || !preview ? (
          <p className="text-muted-foreground">Add items to see the price.</p>
        ) : "error" in preview ? (
          <p className="text-destructive">{preview.error}</p>
        ) : (
          <>
            <p className="font-medium text-pretty">{preview.name}</p>
            <p className="text-muted-foreground nums">
              ${preview.perTiffin.toFixed(2)} base price per tiffin (before plan discounts)
            </p>
          </>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="customMealOverride">
          Override base price per tiffin (plan discounts still apply){" "}
          <span className="text-muted-foreground font-normal">optional</span>
        </Label>
        <Input
          id="customMealOverride"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={0.01}
          max={1000}
          className="min-h-11 sm:max-w-40"
          value={value.basePriceOverride ?? ""}
          onChange={(e) =>
            onChange({ ...value, basePriceOverride: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>
    </div>
  );
}
