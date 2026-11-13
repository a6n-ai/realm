"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Button } from "@foundry/ui/button";
import { FormItem, FormLabel, FormMessage } from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { formatTuHuman, type TuCategory } from "@/lib/menu/format-tu";
import type { FieldDef } from "@/lib/catalog/resource-config";
import type { CompositionCategoryOption } from "@/lib/catalog/resource-hooks";

// Repeating-row editor for a meal size's composition. Each row is a required
// category soft-ref, a plan, and a TU portion; the service full-replaces the
// rows and derives sortOrder from the array order. A row IS one dish pick, so
// "2 raita" is two rows of the same category, not a qty field — the category
// select allows repeats on purpose.
//
// Category comes FIRST: not every category is attached to every plan (that's
// category_plans, an admin-editable membership, not a given), so the plan
// select is scoped to whichever plans this category actually belongs to —
// picking a plan blind, before the category, could offer a plan the category
// was never attached to.
//
// Each row's plan is independent of the meal size's own planId (that's a
// filter/default only) — so one meal size's composition can span plans.
//
// Swap note: exchanges use the FIRST row's TU / pick as the category's rate.
// Later rows of the same category stay separate picks for selection, but do not
// invent a second swap rate — don't imply that in the UI.
export function CompositionField({
  f, form, compositionCategories, plansByCategory,
}: {
  f: FieldDef;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  compositionCategories: CompositionCategoryOption[];
  plansByCategory: Record<string, { value: string; label: string }[]>;
}) {
  // The dialog form is typed as Record<string, unknown>, so RHF can't infer the
  // array element shape from the key — cast the field-array path/append payload.
  const { fields, append, remove } = useFieldArray<Record<string, unknown>>({ control: form.control, name: f.key as never });

  return (
    <FormItem className="grid gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <FormLabel>{f.label}</FormLabel>
        {fields.length > 0 ? (
          <span className="text-muted-foreground text-xs tabular-nums">
            {fields.length} {fields.length === 1 ? "item" : "items"}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        Each row is one pick the customer starts with, on its own plan. Swaps use this category&apos;s first TU / pick as the exchange rate for the whole category.
      </p>

      <div className="grid gap-2">
        {fields.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center text-sm">
            No items yet. Add the category + plan pairs that make up this meal size.
          </p>
        ) : null}

        {fields.map((row, idx) => (
          <CompositionRow
            key={row.id}
            form={form}
            f={f}
            idx={idx}
            compositionCategories={compositionCategories}
            plansByCategory={plansByCategory}
            onRemove={() => remove(idx)}
          />
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start transition-transform active:scale-[0.96]"
          onClick={() => append({ category: "", planId: "", tuAmount: "1", maxTuAmount: "", role: "main" })}
        >
          <PlusIcon className="size-4" /> Add item
        </Button>
      </div>
      <FormMessage />
    </FormItem>
  );
}

function CompositionRow({
  form, f, idx, compositionCategories, plansByCategory, onRemove,
}: {
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  f: FieldDef;
  idx: number;
  compositionCategories: CompositionCategoryOption[];
  plansByCategory: Record<string, { value: string; label: string }[]>;
  onRemove: () => void;
}) {
  const category = form.watch(`${f.key}.${idx}.category`) as string | undefined;
  const tuAmount = form.watch(`${f.key}.${idx}.tuAmount`) as string | undefined;
  const planOptions = category ? (plansByCategory[category] ?? []) : [];
  const cat = compositionCategories.find((c) => c.value === category);
  const tu = Number(tuAmount);
  const naturalHint =
    cat?.tuUnitType && cat.tuUnitSize != null && cat.tuUnitLabel && Number.isFinite(tu) && tu > 0
      ? formatTuHuman(
          { tuUnitType: cat.tuUnitType, tuUnitSize: Number(cat.tuUnitSize), tuUnitLabel: cat.tuUnitLabel } satisfies TuCategory,
          tu,
        )
      : null;

  return (
    <div className="grid gap-2 rounded-lg border p-2">
      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_6rem_4.5rem_7rem_auto]">
        <Controller
          control={form.control}
          name={`${f.key}.${idx}.category`}
          render={({ field }) => (
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs">Category</span>
              <Select
                value={field.value ?? ""}
                onValueChange={(v) => {
                  field.onChange(v);
                  // Plan options are category-scoped — a stale plan from the
                  // previous category could point at a plan this category isn't
                  // even attached to.
                  form.setValue(`${f.key}.${idx}.planId` as never, "" as never);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Pick a category" /></SelectTrigger>
                <SelectContent>
                  {compositionCategories.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
        />
        <Controller
          control={form.control}
          name={`${f.key}.${idx}.planId`}
          render={({ field }) => (
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs">Plan</span>
              <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={!category}>
                <SelectTrigger><SelectValue placeholder={category ? "Pick a plan" : "Pick a category first"} /></SelectTrigger>
                <SelectContent>
                  {planOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          )}
        />
        <Controller
          control={form.control}
          name={`${f.key}.${idx}.tuAmount`}
          render={({ field }) => (
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs">TU / pick</span>
              <Input className="tabular-nums" type="number" step="0.01" min={0} value={field.value ?? ""} onChange={field.onChange} placeholder="1" />
            </label>
          )}
        />
        <Controller
          control={form.control}
          name={`${f.key}.${idx}.maxTuAmount`}
          render={({ field }) => (
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs">Max TU</span>
              <Input className="tabular-nums" type="number" step="0.01" min={0} value={field.value ?? ""} onChange={field.onChange} placeholder="—" />
            </label>
          )}
        />
        <Controller
          control={form.control}
          name={`${f.key}.${idx}.role`}
          render={({ field }) => (
            <label className="grid gap-1">
              <span className="text-muted-foreground text-xs">Role</span>
              <Select value={(field.value as string | undefined) || "main"} onValueChange={field.onChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">Main</SelectItem>
                  <SelectItem value="side_1">Side 1</SelectItem>
                  <SelectItem value="side_2">Side 2</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-10 self-end transition-[color,scale] active:scale-[0.96]"
          aria-label={`Remove item ${idx + 1}`}
          onClick={onRemove}
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      <div className="text-muted-foreground grid gap-0.5 text-caption-2 leading-snug sm:pr-12">
        <p><span className="font-medium text-foreground/80">TU / pick</span> — amount of this category included in each pick.</p>
        <p><span className="font-medium text-foreground/80">Max TU</span> — maximum this category can reach after swaps (leave blank for uncapped).</p>
        <p><span className="font-medium text-foreground/80">Role</span> — Main is the category&apos;s main pick; a Side takes the day&apos;s side dish set on the menu (e.g. the day&apos;s dal).</p>
        {naturalHint ? (
          <p className="text-foreground/70">
            {tuAmount} TU = <span className="font-medium">{naturalHint}</span>
            <span className="text-muted-foreground"> (from category settings)</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}
