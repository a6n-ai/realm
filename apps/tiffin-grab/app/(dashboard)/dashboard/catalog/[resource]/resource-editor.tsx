"use client";

import {
  ArchiveIcon, CheckIcon, EyeOffIcon, InboxIcon, Loader2Icon, PencilIcon, PlusIcon, RotateCcwIcon, TicketPercentIcon, Trash2Icon,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { DataTable, ListPagination, ResponsiveDialog, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { MealCard } from "@/components/marketing/meal-card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@foundry/ui/form";
import { Input } from "@foundry/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { TableCell } from "@foundry/ui/table";
import { cn } from "@foundry/ui/cn";
import type { SortState } from "@/lib/list/sort";
import { formatTuHuman, type TuCategory } from "@/lib/menu/format-tu";
import {
  RESOURCES, emptyForm, rowToForm, slug, type FieldDef, type FieldType, type ResourceDef,
} from "../resource-config";
import { DiscountDialog, type DiscountDialogOptions } from "@/components/dashboard/discount-dialog";
import type { DiscountDto, DiscountKind } from "../discounts/build-rows";
import { reactivateItem, retireItem, saveItem, type ResourceKey } from "../actions";

type Row = Record<string, unknown> & { publicId: string };
type Options = Record<string, { value: string; label: string; group?: string }[]>;
/** Category option for meal-size composition — includes TU facts for read-only natural hints. */
export type CompositionCategoryOption = {
  value: string;
  label: string;
  tuUnitType?: "weight" | "count";
  tuUnitSize?: number;
  tuUnitLabel?: string;
};

const isNumberType = (f: FieldDef) => f.type === "number";
const isArrayType = (f: FieldDef) => f.type === "csv" || f.type === "multiselect";
const isSpanningType = (f: FieldDef) => isArrayType(f) || f.type === "categoryCounts" || f.type === "composition";

// Single source of truth for the table's visible columns: every field except
// hidden ones and the slug key (shown as subtext under the first column). Both
// the real header/rows and the .Skeleton twin render from this, so the loading
// skeleton can never drift from the component.
const visibleCols = (def: ResourceDef) => def.fields.filter((f) => !f.tableHidden && f.key !== "key");

// Which field types carry a meaningful server sort. Arrays (csv/multiselect) and
// images are excluded; the first visible column is always sortable regardless.
const SORTABLE_FIELD_TYPES = new Set<FieldType>(["text", "number", "select", "date", "boolean"]);

// The column keys that are sortable: the visible fields whose type carries a
// meaningful sort, plus the synthetic "status". page.tsx applies the identical
// rule server-side to whitelist + orderBy — kept in lockstep by SORTABLE_FIELD_TYPES.
function sortableColumns(def: ResourceDef): string[] {
  const cols = visibleCols(def);
  return [
    ...cols.filter((f, i) => i === 0 || SORTABLE_FIELD_TYPES.has(f.type)).map((f) => f.key),
    "status",
  ];
}

// DataTable column descriptors — the live header and the .Skeleton twin both
// render from this array, so they can never drift.
function tableColumns(def: ResourceDef): Column<string>[] {
  const sortable = new Set(sortableColumns(def));
  return [
    ...visibleCols(def).map((f, i) => ({
      key: f.key,
      label: f.label,
      sortable: sortable.has(f.key),
      // First column carries the name (+ slug) and is always left-aligned to
      // match renderRow; only the trailing numeric columns right-align.
      ...(i > 0 && isNumberType(f) ? { align: "right" as const } : {}),
    })),
    { key: "status", label: "Status", sortable: true },
    { key: "actions", label: "Actions", align: "right" as const, width: "w-px" },
  ];
}


/** Resolve a stored option value to its human label (dynamic source wins, then static map). */
function labelFor(f: FieldDef, value: string, options: Options): string {
  return options[f.key]?.find((o) => o.value === value)?.label ?? f.optionLabels?.[value] ?? value;
}

function formatNumber(f: FieldDef, n: number): string {
  if (f.unit === "$") return `$${n.toFixed(2)}`;
  if (f.unit === "%") return `${n}%`;
  if (f.unit) return `${n} ${f.unit}`;
  return String(n);
}

/* ─────────────────────────── Dialog form ─────────────────────────── */

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
function CompositionField({
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
          onClick={() => append({ category: "", planId: "", tuAmount: "1", maxTuAmount: "" })}
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
      <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_6rem_4.5rem_auto]">
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
      <div className="text-muted-foreground grid gap-0.5 text-[11px] leading-snug sm:pr-12">
        <p><span className="font-medium text-foreground/80">TU / pick</span> — amount of this category included in each pick.</p>
        <p><span className="font-medium text-foreground/80">Max TU</span> — maximum this category can reach after swaps (leave blank for uncapped).</p>
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

function FieldControl({
  f, form, options, isNew, categoriesByPlan, compositionCategories, plansByCategory,
}: {
  f: FieldDef;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  options: Options;
  isNew: boolean;
  categoriesByPlan?: Record<string, CompositionCategoryOption[]>;
  compositionCategories?: CompositionCategoryOption[];
  plansByCategory?: Record<string, { value: string; label: string }[]>;
}) {
  if (f.type === "composition") {
    return (
      <CompositionField
        f={f}
        form={form}
        compositionCategories={compositionCategories ?? []}
        plansByCategory={plansByCategory ?? {}}
      />
    );
  }
  // Discount targets are per-kind: show only the selected kind's rows (+ "All").
  // eslint-disable-next-line react-hooks/purity -- reads live form state
  const kindNow = f.optionsSource === "discount-targets" ? form.watch("kind") : undefined;
  // A dish's category is scoped to its own plan — the same reason meal-size
  // composition rows scope by plan: a category not attached to this dish's plan
  // could never appear on that plan's menu anyway.
  // eslint-disable-next-line react-hooks/purity -- reads live form state
  const dishPlanId = f.key === "category" && categoriesByPlan ? (form.watch("planId") as string | undefined) : undefined;
  const opts = dishPlanId !== undefined
    ? (dishPlanId ? (categoriesByPlan?.[dishPlanId] ?? []) : [])
    : f.optionsSource
      ? (options[f.key] ?? []).filter((o) => !o.group || o.group === kindNow)
      : (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));
  const keyFrozen = f.readOnlyOnEdit && !isNew;
  // discountValue's unit depends on the sibling discountType field's live value ("%" vs "$") —
  // the only field whose unit isn't static, so this is a targeted override rather than a new
  // FieldDef capability.
  // eslint-disable-next-line react-hooks/purity -- form.watch reads the current live form state, not a pure render input
  const unit = f.key === "discountValue" ? (form.watch("discountType") === "percent" ? "%" : "$") : f.unit;

  return (
    <FormField
      control={form.control}
      name={f.key}
      render={({ field }) => (
        <FormItem className="grid gap-1.5">
          <FormLabel>
            {f.label}
            {f.optional ? <span className="text-muted-foreground font-normal"> optional</span> : null}
            {f.key === "discountValue" ? (
              <a href="/dashboard/catalog/discounts" className="text-primary ml-2 text-xs font-normal hover:underline">See all discounts</a>
            ) : null}
          </FormLabel>
          {f.help ? <p className="text-muted-foreground text-xs">{f.help}</p> : null}
          {f.type === "select" ? (
            <Select
              value={(field.value as string) ?? ""}
              onValueChange={(v) => {
                field.onChange(v);
                // Plan changed: the category field is plan-scoped, so a category
                // picked under the old plan may not exist under the new one.
                if (f.key === "planId" && categoriesByPlan) form.setValue("category" as never, "" as never);
              }}
              disabled={dishPlanId === undefined ? false : !dishPlanId}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={dishPlanId === undefined ? `Select ${f.label.toLowerCase()}` : dishPlanId ? `Select ${f.label.toLowerCase()}` : "Pick a plan first"} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>{opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
          ) : f.type === "multiselect" ? (
            <div className="flex flex-wrap gap-2">
              {opts.map((o) => {
                const arr = (field.value as string[]) ?? [];
                const on = arr.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() => field.onChange(on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm font-medium transition-[color,background-color,border-color] active:scale-[0.96]",
                      on ? "border-primary/30 bg-primary/12 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          ) : f.type === "categoryCounts" ? (
            <div className="grid gap-2">
              {opts.map((o) => {
                const counts = (field.value as Record<string, number>) ?? {};
                const n = counts[o.value] ?? 0;
                return (
                  <div key={o.value} className="flex items-center justify-between gap-3 rounded-md border p-2">
                    <span className="text-sm">{o.label}</span>
                    <Input
                      className="nums w-20"
                      type="number"
                      min={0}
                      value={n === 0 ? "" : n}
                      placeholder="0"
                      onChange={(e) => {
                        const raw = e.target.value;
                        const next = { ...counts };
                        const parsed = raw === "" ? 0 : Number(raw);
                        if (!parsed || parsed <= 0) delete next[o.value];
                        else next[o.value] = parsed;
                        field.onChange(next);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ) : f.type === "csv" ? (
            <FormControl>
              <Input
                value={((field.value as string[]) ?? []).join(", ")}
                onChange={(e) => field.onChange(e.target.value.split(",").map((s) => s.trim()).filter(Boolean))}
                placeholder="comma, separated, values"
              />
            </FormControl>
          ) : f.type === "boolean" ? (
            <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} /></FormControl>
          ) : f.type === "color" ? (
            // Native swatch for picking, hex box for pasting a brand colour.
            // Both write the same #rrggbb the schema validates.
            <div className="flex items-center gap-2">
              <FormControl>
                <input
                  type="color"
                  aria-label={`${f.label} swatch`}
                  value={(field.value as string) || "#888888"}
                  onChange={(e) => field.onChange(e.target.value)}
                  className="border-border size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
                />
              </FormControl>
              <Input
                value={(field.value as string) ?? ""}
                onChange={(e) => field.onChange(e.target.value)}
                placeholder="#16a34a"
                className="font-mono"
              />
              {field.value ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => field.onChange(null)}>
                  Clear
                </Button>
              ) : null}
            </div>
          ) : f.type === "date" ? (
            <FormControl><Input type="date" value={(field.value as string) ?? ""} onChange={field.onChange} /></FormControl>
          ) : (
            <div className="flex items-center gap-1.5">
              {unit === "$" ? <span className="text-muted-foreground text-sm">$</span> : null}
              <FormControl>
                <Input
                  className={isNumberType(f) ? "nums" : undefined}
                  type={isNumberType(f) ? "number" : "text"}
                  disabled={keyFrozen}
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                />
              </FormControl>
              {unit && unit !== "$" ? <span className="text-muted-foreground text-sm">{unit}</span> : null}
            </div>
          )}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Live mirror of how a row renders on the customer site. Reuses the real
 * marketing components (MealCard) and replicates the exact /pricing markup so
 * the preview can't drift from production. Resources with no public surface say
 * so honestly instead of inventing a fake look.
 */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function optMacro(v: unknown): number | null {
  return v === "" || v == null ? null : num(v);
}

const INTERNAL_PREVIEW: Record<string, string> = {
  "pricing-tiers": "Not shown directly. Shapes the per-tiffin rate as order volume increases.",
  addons: "Not shown on the public site yet. Offered as an order add-on.",
};

function WebsitePreview({ resource, values }: { resource: string; values: Record<string, unknown> }) {
  let body: React.ReactNode;

  if (resource === "meal-sizes") {
    body = (
      <div className="max-w-xs">
        <MealCard
          meal={{
            id: 0n,
            publicId: "preview",
            key: String(values.key ?? ""),
            name: String(values.name || "Meal name"),
            description: values.description ? String(values.description) : null,
            planId: 0n,
            planKey: String(values.planId ?? ""),
            tier: (values.tier as "budget" | "medium" | "premium") || "budget",
            // components is derived from the composition rows, not hand-edited.
            components: ((values.items as { name?: string }[]) ?? []).map((i) => i?.name ?? "").filter(Boolean),
            items: [],
            kcalMin: num(values.kcalMin),
            kcalMax: num(values.kcalMax),
            proteinG: optMacro(values.proteinG),
            carbsG: optMacro(values.carbsG),
            fatG: optMacro(values.fatG),
            basePrice: num(values.basePrice),
            discountType: (values.discountType as "none" | "percent" | "flat") || "none",
            discountValue: num(values.discountValue),
            trial: Boolean(values.trial),
          }}
        />
      </div>
    );
  } else if (resource === "plans") {
    // Mirrors the "Nutrition baselines" card on /pricing.
    body = (
      <div className="max-w-xs rounded-lg border p-5">
        <h3 className="font-medium">{String(values.name || "Plan name")}</h3>
        {values.description ? <p className="text-muted-foreground mt-1 text-sm">{String(values.description)}</p> : null}
      </div>
    );
  } else if (resource === "delivery-frequencies") {
    // Mirrors the "Frequencies" list on /pricing.
    body = (
      <ul className="text-muted-foreground max-w-xs space-y-1 text-sm">
        <li className="flex justify-between"><span>{String(values.name || "Frequency")}</span></li>
      </ul>
    );
  } else if (resource === "duration-packages") {
    // Mirrors the "Commitment" list on /pricing.
    const w = num(values.weeks);
    body = (
      <ul className="text-muted-foreground max-w-xs space-y-1 text-sm">
        <li className="flex justify-between"><span>{w || "—"} week{w === 1 ? "" : "s"}</span></li>
      </ul>
    );
  } else {
    body = (
      <p className="text-muted-foreground flex items-start gap-2 text-sm">
        <EyeOffIcon className="mt-0.5 size-4 shrink-0" />
        {INTERNAL_PREVIEW[resource] ?? "Not shown on the public site."}
      </p>
    );
  }

  return (
    <div className="border-border/70 bg-muted/30 sm:col-span-2 -mx-5 -mb-5 mt-1 border-t px-5 py-4">
      <p className="text-muted-foreground/80 text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
        Website preview
      </p>
      <div className="mt-3">{body}</div>
    </div>
  );
}

function EditorDialog({
  resource, def, options, editing, onClose, categoriesByPlan, compositionCategories, plansByCategory,
}: {
  resource: string;
  def: ResourceDef;
  options: Options;
  editing: { id: string; row: Row | null };
  onClose: () => void;
  categoriesByPlan?: Record<string, CompositionCategoryOption[]>;
  compositionCategories?: CompositionCategoryOption[];
  plansByCategory?: Record<string, { value: string; label: string }[]>;
}) {
  const router = useRouter();
  const isNew = editing.id === "__new__";
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(def.schema),
    defaultValues: editing.row ? rowToForm(def, editing.row) : emptyForm(def),
  });

  // On create, mirror `key` to slug(name) until the user unlocks it manually.
  const [keyManual, setKeyManual] = useState(false);
  const nameVal = form.watch("name");
  useEffect(() => {
    if (isNew && def.keyed && !keyManual) form.setValue("key", slug(String(nameVal ?? "")));
  }, [isNew, def.keyed, keyManual, nameVal, form]);

  async function onSubmit(values: Record<string, unknown>) {
    try {
      await saveItem(resource as ResourceKey, isNew ? null : editing.id, values);
      onClose();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (/key|unique|duplicate/i.test(msg)) form.setError("key", { message: "That key is already taken" });
      form.setError("root", { message: msg });
    }
  }

  const submitting = form.formState.isSubmitting;
  const keyField = def.fields.find((f) => f.key === "key");
  const watched = form.watch();

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? `New ${def.singular}` : `Edit ${def.singular}`}
      description={def.fields.some((f) => f.section) ? undefined : "Typed fields, validated before saving."}
      contentClassName={cn("flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0", resource === "meal-sizes" ? "sm:max-w-3xl" : "sm:max-w-2xl")}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting} className="min-h-11 sm:min-h-9">Cancel</Button>
          <Button type="submit" form="resource-editor-form" disabled={submitting} className="min-h-11 sm:min-h-9 active:scale-[0.96]">
            {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {submitting ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <Form {...form}>
        <form id="resource-editor-form" onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
            {def.note ? <p className="text-muted-foreground text-sm sm:col-span-2">{def.note}</p> : null}
            {def.fields.map((f, i) => {
              const prevSection = i > 0 ? def.fields[i - 1].section : undefined;
              const showSectionHeader = f.section && f.section !== prevSection;
              return (
                <Fragment key={f.key}>
                  {showSectionHeader ? (
                    <h3
                      key={`${f.key}-section`}
                      className={cn(
                        "text-muted-foreground text-xs font-semibold tracking-wide uppercase sm:col-span-2",
                        i > 0 ? "mt-2 border-t pt-5" : "",
                      )}
                    >
                      {f.section}
                    </h3>
                  ) : null}
                  <div key={f.key} className={isSpanningType(f) ? "sm:col-span-2" : undefined}>
                    <FieldControl f={f} form={form} options={options} isNew={isNew} categoriesByPlan={categoriesByPlan} compositionCategories={compositionCategories} plansByCategory={plansByCategory} />
                    {f.key === "key" && isNew && keyField?.readOnlyOnEdit && !keyManual ? (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1 text-xs transition-colors"
                        onClick={() => setKeyManual(true)}
                      >
                        <PencilIcon className="size-3" /> Edit key
                      </button>
                    ) : null}
                  </div>
                </Fragment>
              );
            })}
            {form.formState.errors.root ? (
              <p className="text-destructive text-sm sm:col-span-2" role="alert">
                {form.formState.errors.root.message as string}
              </p>
            ) : null}
            <WebsitePreview resource={resource} values={watched} />
          </div>
        </form>
      </Form>
    </ResponsiveDialog>
  );
}

/* ─────────────────────────── List table ─────────────────────────── */

function Cell({ f, value, options }: { f: FieldDef; value: unknown; options: Options }) {
  const isEmptyCategoryCounts = f.type === "categoryCounts" && value != null && typeof value === "object" && Object.keys(value).length === 0;
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0) || isEmptyCategoryCounts) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  if (f.type === "categoryCounts") {
    const counts = value as Record<string, number>;
    const text = Object.entries(counts).map(([k, n]) => `${labelFor(f, k, options)} × ${n}`).join(", ");
    return <span className="text-muted-foreground block max-w-[14rem] truncate" title={text}>{text}</span>;
  }
  if (f.type === "select") {
    return <Badge variant="secondary" className="font-normal">{labelFor(f, String(value), options)}</Badge>;
  }
  if (f.type === "color") {
    // Swatch + hex, so the column is scannable at a glance and still exact.
    const hex = String(value);
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          aria-hidden
          className="border-border size-3.5 shrink-0 rounded-full border"
          style={{ backgroundColor: hex }}
        />
        <span className="text-muted-foreground font-mono text-xs">{hex}</span>
      </span>
    );
  }
  if (isArrayType(f)) {
    const labels = (value as string[]).map((v) => labelFor(f, v, options));
    const text = labels.join(", ");
    return <span className="text-muted-foreground block max-w-[14rem] truncate" title={text}>{text}</span>;
  }
  if (f.type === "boolean") {
    return value ? <CheckIcon className="text-ok size-4" /> : <span className="text-muted-foreground/50">—</span>;
  }
  if (isNumberType(f)) {
    return <span className="tabular-nums">{formatNumber(f, Number(value))}</span>;
  }
  return <span>{String(value)}</span>;
}

// Frequencies / duration rows get an "Add discount" action that reuses the central DiscountDialog.
export interface DiscountCtx {
  kind: DiscountKind;
  options: DiscountDialogOptions;
  byTarget: Record<string, DiscountDto>;
}

export function ResourceEditor({
  discountCtx, resource, rows, dynamicOptions, sort, spec, total, page, size, categoriesByPlan, compositionCategories, plansByCategory,
}: {
  resource: string;
  rows: Row[];
  dynamicOptions: Options;
  sort: SortState<string>;
  // Dishes: category options scoped by the dish's own plan.
  categoriesByPlan?: Record<string, CompositionCategoryOption[]>;
  // Meal-size composition rows: category comes first, plan options scoped to it.
  compositionCategories?: CompositionCategoryOption[];
  plansByCategory?: Record<string, { value: string; label: string }[]>;
  discountCtx?: DiscountCtx;
  // Same server-side facet framework the orders and inquiries lists use.
  spec: FacetDef[];
  total: number;
  page: number;
  size: number;
}) {
  const def = RESOURCES[resource];
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; row: Row | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discountDlg, setDiscountDlg] = useState<{ discount?: DiscountDto; target: string } | null>(null);

  const cols = visibleCols(def);
  const first = cols[0];
  const rest = cols.slice(1);
  const retired = rows.filter((r) => r.active === false).length;
  const activeCount = rows.length - retired;

  const act = (id: string, fn: () => Promise<void>) => {
    setError(null);
    setBusyId(id);
    fn()
      .then(() => router.refresh())
      .catch((e) => setError(e instanceof Error ? e.message : "Action failed"))
      .finally(() => setBusyId(null));
  };

  const openNew = () => setEditing({ id: "__new__", row: null });

  return (
    <div className="space-y-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <DataTable
        columns={tableColumns(def)}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        rowClassName={(r) =>
          cn(
            "transition-colors",
            r.active === false && "opacity-55",
            busyId === r.publicId && "pointer-events-none opacity-60",
          )
        }
        filters={<ListSearchFilters spec={spec} />}
        actions={
          <Button onClick={openNew} className="active:scale-[0.96]">
            <PlusIcon className="size-4" /> Add {def.singular}
          </Button>
        }
        emptyIcon={InboxIcon}
        emptyMessage={`No ${def.label.toLowerCase()} yet.`}
        emptySearchMessage={`No ${def.label.toLowerCase()} match your search.`}
        emptyAction={
          <Button variant="outline" size="sm" onClick={openNew}>
            <PlusIcon className="size-4" /> Add {def.singular}
          </Button>
        }
        renderRow={(row) => {
          const isRetired = row.active === false;
          const busy = busyId === row.publicId;
          return (
            <>
              <TableCell className="font-medium">
                <span className="text-balance">{String(row[first.key] ?? row.publicId)}</span>
                {discountCtx && discountCtx.byTarget[row.publicId] ? (
                  <button
                    type="button"
                    className="bg-ok/10 text-ok ml-2 rounded-full px-2 py-0.5 text-xs font-medium"
                    onClick={() => setDiscountDlg({ discount: discountCtx.byTarget[row.publicId], target: row.publicId })}
                  >
                    Save {discountCtx.byTarget[row.publicId].percent}%
                  </button>
                ) : null}
                {def.keyed ? <span className="text-muted-foreground/70 block text-xs font-normal">{String(row.key ?? "")}</span> : null}
              </TableCell>
              {rest.map((f) => (
                <TableCell key={f.key} className={isNumberType(f) ? "text-right tabular-nums" : undefined}>
                  <Cell f={f} value={row[f.key]} options={dynamicOptions} />
                </TableCell>
              ))}
              <TableCell>
                {isRetired
                  ? <Badge variant="outline" className="text-muted-foreground font-normal">Retired</Badge>
                  : <span className="text-ok inline-flex items-center gap-1.5 text-xs font-medium"><span className="bg-ok size-1.5 rounded-full" />Active</span>}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {discountCtx ? (
                    <Button size="sm" variant="ghost" onClick={() => setDiscountDlg({ discount: discountCtx.byTarget[row.publicId], target: row.publicId })} disabled={busy}>
                      <TicketPercentIcon className="size-3.5" /> {discountCtx.byTarget[row.publicId] ? "Discount" : "Add discount"}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setEditing({ id: row.publicId, row })} disabled={busy}>
                    <PencilIcon className="size-3.5" /> Edit
                  </Button>
                  {isRetired ? (
                    <Button size="sm" variant="ghost" onClick={() => act(row.publicId, () => reactivateItem(resource as ResourceKey, row.publicId))} disabled={busy}>
                      <RotateCcwIcon className="size-3.5" /> Restore
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => act(row.publicId, () => retireItem(resource as ResourceKey, row.publicId))} disabled={busy}>
                      <ArchiveIcon className="size-3.5" /> Retire
                    </Button>
                  )}
                </div>
              </TableCell>
            </>
          );
        }}
      />

      <ListPagination page={page} size={size} total={total} />

      {discountCtx ? (
        <DiscountDialog
          open={discountDlg != null}
          onOpenChange={(o) => !o && setDiscountDlg(null)}
          discount={discountDlg?.discount}
          prefill={{ kind: discountCtx.kind, targetPublicId: discountDlg?.target, lockTarget: true }}
          options={discountCtx.options}
        />
      ) : null}

      {editing ? (
        <EditorDialog
          key={editing.id}
          resource={resource}
          def={def}
          options={dynamicOptions}
          categoriesByPlan={categoriesByPlan}
          compositionCategories={compositionCategories}
          plansByCategory={plansByCategory}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

// Loading twin is now owned by DataTable — same tableColumns() source of truth,
// zero drift. Rendered as the page's <Suspense fallback>.
export function ResourceEditorSkeleton({ resource }: { resource: string }) {
  const def = RESOURCES[resource];
  return <DataTable.Skeleton columns={def ? tableColumns(def) : []} />;
}
