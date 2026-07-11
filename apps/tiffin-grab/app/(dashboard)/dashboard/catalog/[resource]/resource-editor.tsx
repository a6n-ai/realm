"use client";

import {
  ArchiveIcon, CheckIcon, EyeOffIcon, InboxIcon, Loader2Icon, PencilIcon, PlusIcon, RotateCcwIcon,
} from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { DataTable, ResponsiveDialog, type Column } from "@/components/ds";
import { ImageUploader } from "@/components/files";
import type { FileDetail } from "@realm/storage/model";
import { MealCard } from "@/components/marketing/cards";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Switch } from "@realm/ui/switch";
import { TableCell } from "@realm/ui/table";
import { cn } from "@realm/ui/cn";
import type { SortState } from "@/lib/list/sort";
import {
  RESOURCES, emptyForm, rowToForm, slug, type FieldDef, type FieldType, type ResourceDef,
} from "../resource-config";
import { reactivateItem, retireItem, saveItem, type ResourceKey } from "../actions";

type Row = Record<string, unknown> & { publicId: string };
type Options = Record<string, { value: string; label: string }[]>;

const isNumberType = (f: FieldDef) => f.type === "number";
const isArrayType = (f: FieldDef) => f.type === "csv" || f.type === "multiselect";
const isSpanningType = (f: FieldDef) => isArrayType(f) || f.type === "categoryCounts";

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

// Client-side search keys: the text-ish visible columns plus the slug on keyed
// resources. Numeric/image columns are skipped — substring search over them is noise.
function searchKeys(def: ResourceDef): (keyof Row)[] {
  const keys = visibleCols(def)
    .filter((f) => f.type === "text" || f.type === "select" || isArrayType(f))
    .map((f) => f.key);
  if (def.keyed) keys.push("key");
  return keys as (keyof Row)[];
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

function FieldControl({
  f, form, options, isNew,
}: {
  f: FieldDef;
  form: ReturnType<typeof useForm<Record<string, unknown>>>;
  options: Options;
  isNew: boolean;
}) {
  const opts = f.optionsSource
    ? (options[f.key] ?? [])
    : (f.options ?? []).map((o) => ({ value: o, label: f.optionLabels?.[o] ?? o }));
  const keyFrozen = f.readOnlyOnEdit && !isNew;

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
          {f.type === "select" ? (
            <Select value={(field.value as string) ?? ""} onValueChange={field.onChange}>
              <FormControl><SelectTrigger><SelectValue placeholder={`Select ${f.label.toLowerCase()}`} /></SelectTrigger></FormControl>
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
          ) : f.type === "image" ? (
            <FormControl>
              <ImageUploader
                value={(field.value as FileDetail | null) ?? null}
                onChange={field.onChange}
                prefix="catalog/dishes"
              />
            </FormControl>
          ) : f.type === "date" ? (
            <FormControl><Input type="date" value={(field.value as string) ?? ""} onChange={field.onChange} /></FormControl>
          ) : (
            <div className="flex items-center gap-1.5">
              {f.unit === "$" ? <span className="text-muted-foreground text-sm">$</span> : null}
              <FormControl>
                <Input
                  className={isNumberType(f) ? "nums" : undefined}
                  type={isNumberType(f) ? "number" : "text"}
                  disabled={keyFrozen}
                  value={(field.value as string) ?? ""}
                  onChange={field.onChange}
                />
              </FormControl>
              {f.unit && f.unit !== "$" ? <span className="text-muted-foreground text-sm">{f.unit}</span> : null}
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
  "delivery-zones": "Not shown on the public site. Used to match a customer's postal code to a delivery window.",
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
            planId: 0n,
            planKey: String(values.planId ?? ""),
            tier: (values.tier as "budget" | "medium" | "premium") || "budget",
            components: (values.components as string[]) ?? [],
            items: [],
            kcalMin: num(values.kcalMin),
            kcalMax: num(values.kcalMax),
            proteinG: optMacro(values.proteinG),
            carbsG: optMacro(values.carbsG),
            fatG: optMacro(values.fatG),
            basePrice: num(values.basePrice),
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
  resource, def, options, editing, onClose,
}: {
  resource: string;
  def: ResourceDef;
  options: Options;
  editing: { id: string; row: Row | null };
  onClose: () => void;
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
      description="Typed fields, validated before saving."
      contentClassName="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
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
            {def.fields.map((f) => (
              <div key={f.key} className={isSpanningType(f) ? "sm:col-span-2" : undefined}>
                <FieldControl f={f} form={form} options={options} isNew={isNew} />
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
            ))}
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
  if (isArrayType(f)) {
    const labels = (value as string[]).map((v) => labelFor(f, v, options));
    const text = labels.join(", ");
    return <span className="text-muted-foreground block max-w-[14rem] truncate" title={text}>{text}</span>;
  }
  if (f.type === "image") {
    const url = (value as { url?: string }).url;
    if (!url) return <span className="text-muted-foreground/50">—</span>;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="size-9 rounded-md border object-cover" />;
  }
  if (f.type === "boolean") {
    return value ? <CheckIcon className="text-ok size-4" /> : <span className="text-muted-foreground/50">—</span>;
  }
  if (isNumberType(f)) {
    return <span className="tabular-nums">{formatNumber(f, Number(value))}</span>;
  }
  return <span>{String(value)}</span>;
}

export function ResourceEditor({
  resource, rows, dynamicOptions, sort,
}: {
  resource: string;
  rows: Row[];
  dynamicOptions: Options;
  sort: SortState<string>;
}) {
  const def = RESOURCES[resource];
  const router = useRouter();
  const [editing, setEditing] = useState<{ id: string; row: Row | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
        search={{ placeholder: `Search ${def.label.toLowerCase()}…`, shortPlaceholder: "Search…", keys: searchKeys(def) }}
        rowClassName={(r) =>
          cn(
            "transition-colors",
            r.active === false && "opacity-55",
            busyId === r.publicId && "pointer-events-none opacity-60",
          )
        }
        filters={
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground font-medium tabular-nums">{activeCount}</span> active
            {retired ? <> · <span className="tabular-nums">{retired}</span> retired</> : null}
          </p>
        }
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

      {editing ? (
        <EditorDialog
          key={editing.id}
          resource={resource}
          def={def}
          options={dynamicOptions}
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
