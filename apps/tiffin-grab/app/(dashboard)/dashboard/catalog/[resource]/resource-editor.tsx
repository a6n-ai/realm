"use client";
import { useAppCurrency, useFormatMoney } from "@/components/app-currency";



import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";

import { ArchiveIcon, CheckIcon, InboxIcon, Loader2Icon, PencilIcon, PlusIcon, RotateCcwIcon, TicketPercentIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";

import { useRouter } from "next/navigation";

import { Fragment, useEffect, useState } from "react";

import { useForm } from "react-hook-form";
import { Badge } from "@foundry/ui/badge";

import { Button } from "@foundry/ui/button";

import { DataTable, ListPagination, ResponsiveDialog, type Column, type FacetDef } from "@/components/ds";

import { ListSearchFilters } from "@/components/filters/reui-facet-filters";

import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@foundry/ui/form";

import { Input } from "@foundry/ui/input";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";

import { Switch } from "@foundry/ui/switch";

import { findSimilarDishes } from "@/lib/menu/similar-dishes";

import { TableCell } from "@foundry/ui/table";

import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";

import { cn } from "@foundry/ui/cn";

import type { SortState } from "@foundry/design-system/list-sort";

import { RESOURCES, emptyForm, rowToForm, slug, sortableColumns, type FieldDef, type ResourceDef } from "@/lib/catalog/resource-config";
import { DiscountDialog, type DiscountDialogOptions } from "@/app/(dashboard)/dashboard/catalog/discounts/discount-dialog";

import { discountValueLabel, type DiscountDto, type DiscountKind } from "../discounts/build-rows";

import { ActionError, unwrapAction } from "@/lib/actions/unwrap";

import { reactivateItem, retireItem, saveItem, type ResourceKey } from "../actions";

import { DateInput } from "@/components/dashboard/date-fields";

import { CompositionField } from "./composition-field";

import { WebsitePreview } from "./website-preview";

import type { EditorExtras } from "@/lib/catalog/resource-hooks";


type Row = Record<string, unknown> & { publicId: string };
type Options = Record<string, { value: string; label: string; group?: string }[]>;
/** Category option for meal-size composition — includes TU facts for read-only natural hints. */

const isNumberType = (f: FieldDef) => f.type === "number";
const isArrayType = (f: FieldDef) => f.type === "csv" || f.type === "multiselect";
const isSpanningType = (f: FieldDef) => isArrayType(f) || f.type === "categoryCounts" || f.type === "composition";

// Single source of truth for the table's visible columns: every field except
// hidden ones and the slug key (shown as subtext under the first column). Both
// the real header/rows and the .Skeleton twin render from this, so the loading
// skeleton can never drift from the component.
const visibleCols = (def: ResourceDef) => def.fields.filter((f) => !f.tableHidden && f.key !== "key");

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

function formatNumber(f: FieldDef, n: number, money: (n: number) => string): string {
  if (f.unit === "$") return money(n);
  if (f.unit === "%") return `${n}%`;
  if (f.unit) return `${n} ${f.unit}`;
  return String(n);
}

/* ─────────────────────────── Dialog form ─────────────────────────── */

function FieldControl({
  f, form, options, isNew, extras, parent, dependents,
}: {
  f: FieldDef;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  options: Options;
  isNew: boolean;
  extras: EditorExtras;
  /** The field this one's options are scoped by (FieldDef.scopedBy). */
  parent?: FieldDef;
  /** Fields scoped by this one; cleared when it changes, since their old pick may not exist under the new value. */
  dependents: string[];
}) {
  if (f.type === "composition") {
    return (
      <CompositionField
        f={f}
        form={form}
        compositionCategories={extras.compositionCategories ?? []}
        plansByCategory={extras.plansByCategory ?? {}}
      />
    );
  }
  // Discount targets are per-kind: show only the selected kind's rows (+ "All").
  const kindNow = f.optionsSource === "discount-targets" ? form.watch("kind") : undefined;
  const parentValue = parent ? ((form.watch(parent.key) as string | undefined) ?? "") : undefined;
  const opts = parentValue !== undefined
    ? (parentValue ? (extras.scopedOptions?.[f.key]?.[parentValue] ?? []) : [])
    : f.optionsSource
      ? (options[f.key] ?? []).filter((o) => !o.group || o.group === kindNow)
      : (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));
  const keyFrozen = f.readOnlyOnEdit && !isNew;
  const unit = f.unit;

  return (
    <FormField
      control={form.control}
      name={f.key}
      render={({ field }) => (
        <FormItem className="grid gap-1.5">
          <FormLabel>
            {f.label}
            {f.optional ? <span className="text-muted-foreground font-normal"> optional</span> : null}
          </FormLabel>
          {f.help ? <p className="text-muted-foreground text-xs">{f.help}</p> : null}
          {f.type === "select" ? (
            <Select
              value={(field.value as string) ?? ""}
              onValueChange={(v) => {
                field.onChange(v);
                // Plan changed: the category field is plan-scoped, so a category
                // picked under the old plan may not exist under the new one.
                for (const dep of dependents) form.setValue(dep as never, "" as never);
              }}
              disabled={parentValue === ""}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder={parentValue === "" ? `Pick a ${parent!.label.toLowerCase()} first` : `Select ${f.label.toLowerCase()}`} />
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
                    {on && f.ordered && <span className="mr-1.5 text-xs tabular-nums">{arr.indexOf(o.value) + 1}</span>}
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
            <FormControl><DateInput value={(field.value as string) ?? ""} onChange={field.onChange} /></FormControl>
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

function EditorDialog({
  resource, def, options, editing, onClose, extras,
}: {
  resource: string;
  def: ResourceDef;
  options: Options;
  editing: { id: string; row: Row | null };
  onClose: () => void;
  extras: EditorExtras;
}) {
  const fieldByKey = new Map(def.fields.map((f) => [f.key, f]));
  const router = useRouter();
  const isNew = editing.id === "__new__";
  const form = useForm<Record<string, unknown>>({
    resolver: zodResolver(def.schema),
    defaultValues: editing.row ? rowToForm(def, editing.row) : emptyForm(def),
  });

  // Admins never type a key: on create it is derived from the name (categories call it label).
  const nameVal = form.watch("name");
  const labelVal = form.watch("label");
  const similarDishes = extras.dishNames
    ? findSimilarDishes(String(nameVal ?? ""), extras.dishNames.filter((d) => d.id !== editing.id))
    : [];
  useEffect(() => {
    if (isNew && def.keyed) form.setValue("key", slug(String(nameVal ?? labelVal ?? "")));
  }, [isNew, def.keyed, nameVal, labelVal, form]);

  async function onSubmit(values: Record<string, unknown>) {
    try {
      await unwrapAction(saveItem(resource as ResourceKey, isNew ? null : editing.id, values));
      onClose();
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      form.setError("root", { message: e instanceof ActionError && e.status === 409 ? `A ${def.singular} with this name already exists` : msg });
    }
  }

  const submitting = form.formState.isSubmitting;
  const watched = form.watch();
  const formFields = isNew ? def.fields.filter((f) => f.key !== "key") : def.fields;

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? `New ${def.singular}` : `Edit ${def.singular}`}
      description={def.fields.some((f) => f.section) ? undefined : "Typed fields, validated before saving."}
      contentClassName={cn("flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0", def.wideDialog ? "sm:max-w-3xl" : "sm:max-w-2xl")}
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {def.note ? <p className="text-muted-foreground text-sm sm:col-span-2">{def.note}</p> : null}
            {formFields.map((f, i) => {
              const prevSection = i > 0 ? formFields[i - 1].section : undefined;
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
                    <FieldControl
                      f={f}
                      form={form}
                      options={options}
                      isNew={isNew}
                      extras={extras}
                      parent={f.scopedBy ? fieldByKey.get(f.scopedBy) : undefined}
                      dependents={def.fields.filter((g) => g.scopedBy === f.key).map((g) => g.key)}
                    />
                    {f.key === "name" && similarDishes.length > 0 ? (
                      <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                        <p className="mb-1 font-medium">Already in the catalog. Edit that one instead?</p>
                        <ul className="space-y-0.5">
                          {similarDishes.map((d) => (
                            <li key={d.id}>{d.name} <span className="text-muted-foreground">· {d.planName}{d.active ? "" : " · inactive"}</span></li>
                          ))}
                        </ul>
                      </div>
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
  const money = useFormatMoney();
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
    // Optional blanks (cost price, macros when un-hidden) must not render as $0.
    if (value == null || value === "") {
      return <span className="text-muted-foreground/50">—</span>;
    }
    return <span className="tabular-nums">{formatNumber(f, Number(value), money)}</span>;
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
  discountCtx, resource, rows, dynamicOptions, sort, spec, total, page, size, extras = {},
}: {
  resource: string;
  rows: Row[];
  dynamicOptions: Options;
  sort: SortState<string>;
  /** What only some resources need (scoped options, composition, duplicate-name hint); see RESOURCE_HOOKS. */
  extras?: EditorExtras;
  discountCtx?: DiscountCtx;
  // Same server-side facet framework the orders and inquiries lists use.
  spec: FacetDef[];
  total: number;
  page: number;
  size: number;
}) {
  const def = RESOURCES[resource];
  const router = useRouter();
  const currency = useAppCurrency();
  const [editing, setEditing] = useState<{ id: string; row: Row | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [discountDlg, setDiscountDlg] = useState<{ discount?: DiscountDto; target: string } | null>(null);

  const cols = visibleCols(def);
  const first = cols[0];
  const rest = cols.slice(1);

  const act = (id: string, fn: () => Promise<unknown>) => {
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
        serialOffset={pageOffset(page, size)}
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
                    Save {discountValueLabel(discountCtx.byTarget[row.publicId], currency)}
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
                    <IconAction label={discountCtx.byTarget[row.publicId] ? "Edit discount" : "Add discount"} onClick={() => setDiscountDlg({ discount: discountCtx.byTarget[row.publicId], target: row.publicId })} disabled={busy}>
                      <TicketPercentIcon className={discountCtx.byTarget[row.publicId] ? "text-primary size-4" : "size-4"} />
                    </IconAction>
                  ) : null}
                  <IconAction label={`Edit ${def.singular}`} onClick={() => setEditing({ id: row.publicId, row })} disabled={busy}>
                    <PencilIcon className="size-4" />
                  </IconAction>
                  {isRetired ? (
                    <IconAction label={`Restore ${def.singular}`} onClick={() => act(row.publicId, () => unwrapAction(reactivateItem(resource as ResourceKey, row.publicId)))} disabled={busy}>
                      <RotateCcwIcon className="size-4" />
                    </IconAction>
                  ) : (
                    <IconAction label={`Retire ${def.singular}`} className="text-muted-foreground hover:text-foreground" onClick={() => act(row.publicId, () => unwrapAction(retireItem(resource as ResourceKey, row.publicId)))} disabled={busy}>
                      <ArchiveIcon className="size-4" />
                    </IconAction>
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
          extras={extras}
          editing={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function IconAction({ label, className, onClick, disabled, children }: { label: string; className?: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon-sm" variant="ghost" className={className} onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// Loading twin is now owned by DataTable — same tableColumns() source of truth,
// zero drift. Rendered as the page's <Suspense fallback>.
export function ResourceEditorSkeleton({ resource }: { resource: string }) {
  const def = RESOURCES[resource];
  return <DataTable.Skeleton columns={def ? tableColumns(def) : []} />;
}
