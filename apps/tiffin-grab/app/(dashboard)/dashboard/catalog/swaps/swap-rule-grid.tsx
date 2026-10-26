"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRightIcon, ArrowRightIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { SectionCard, DataTable, ResponsiveDialog, type Column } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { TableCell } from "@foundry/ui/table";
import { Switch } from "@foundry/ui/switch";
import { Badge } from "@/components/reui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { addSwapPair, editSwapPair, removeSwapPair } from "./actions";
import { naturalSwapConversion, type AdminTuCategory } from "../admin-tu-hints";
import { formatTuHuman } from "@/lib/menu/format-tu";
import type { ExchangeOverride } from "@/lib/menu/swap-rules";

export type CategoryOption = { key: string; label: string };
export type PlanOption = { value: string; label: string };
export type MealSizeOption = { id: string; name: string; planId: string };
export type SwapPairRow = {
  id: string; // pair publicId
  fromCategory: string;
  fromLabel: string;
  toCategory: string;
  toLabel: string;
  // Null = the rule applies to every plan.
  planId: string | null;
  planName: string;
  exchangeOverrides: ExchangeOverride[];
  /** "Other amounts": an amount with no line uses the natural exchange (true) or can't be swapped (false). */
  naturalFallback: boolean;
  receivesMissing: boolean;
  mealSizeId: string | null;
  mealSizeName: string | null;
};

/** Admin enters natural units (12 oz, 8 roti); the category's unit is fixed, only the amount is overridden. */
type OverrideDraft = { give: string; receive: string };

const toNatural = (cat: AdminTuCategory, tu: number) => String(Number((tu * cat.tuUnitSize).toFixed(2)));
const unitOf = (cat: AdminTuCategory | undefined) => cat?.tuUnitLabel ?? "TU";

// Radix Select rejects an empty-string item value, so "all plans" needs a
// real sentinel — translated back to null at the service-call boundary.
const ALL_PLANS = "__all_plans__";
const ALL_SIZES = "__all_sizes__";

type Cols = "pair" | "plan" | "exchange" | "actions";
const COLUMNS: readonly Column<Cols>[] = [
  { key: "pair", label: "Swap" },
  { key: "plan", label: "Plan" },
  { key: "exchange", label: "Exchange" },
  { key: "actions", label: "", align: "right" },
];

export function SwapPairGrid({
  categoryOptions,
  categoryTu,
  planOptions,
  mealSizeOptions,
  plansByCategoryKey,
  pairs,
}: {
  categoryOptions: CategoryOption[];
  categoryTu: AdminTuCategory[];
  planOptions: PlanOption[];
  mealSizeOptions: MealSizeOption[];
  plansByCategoryKey: Record<string, string[]>;
  pairs: SwapPairRow[];
}) {
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<SwapPairRow | null>(null);
  const tuByKey = React.useMemo(() => new Map(categoryTu.map((c) => [c.key, c])), [categoryTu]);

  return (
    <SectionCard
      title="Swap rules"
      subtitle="One direction per row — Roti → Rice does not create Rice → Roti. A rule with no plan set applies to every plan; a rule scoped to one plan only works there. Whether a swap actually runs also depends on that plan having a dish in the target category — see Dishes."
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          <PlusIcon data-icon="inline-start" /> Add rule
        </Button>
      }
    >
      <DataTable
        pagination="client"
        columns={COLUMNS}
        rows={pairs}
        rowKey={(p) => p.id}
        serial={false}
        emptyIcon={ArrowLeftRightIcon}
        emptyMessage="No swap rules configured yet."
        renderRow={(pair) => {
          const fromTu = tuByKey.get(pair.fromCategory);
          const toTu = tuByKey.get(pair.toCategory);
          const conv = naturalSwapConversion(fromTu, toTu);
          return (
          <>
            <TableCell>
              <span className="flex items-center gap-2 text-sm font-medium">
                {pair.fromLabel}
                <ArrowRightIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                {pair.toLabel}
              </span>
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-2 text-sm">
                {pair.mealSizeName ?? pair.planName}
                {pair.receivesMissing ? <Badge variant="info-light">Adds missing</Badge> : null}
              </span>
            </TableCell>
            <TableCell>
              {pair.exchangeOverrides.length > 0 && fromTu && toTu ? (
                <div className="text-sm">
                  {pair.exchangeOverrides.map((o) => (
                    <div key={o.giveTu} className="font-medium">
                      {formatTuHuman(fromTu, o.giveTu)} → {formatTuHuman(toTu, o.receiveTu)}
                    </div>
                  ))}
                  <div className="text-muted-foreground text-xs">Other amounts: {pair.naturalFallback ? "natural exchange" : "not allowed"}</div>
                </div>
              ) : !pair.naturalFallback ? (
                <span className="text-muted-foreground text-sm">No amounts allowed (add a line)</span>
              ) : conv ? (
                <div className="text-sm">
                  <div className="font-medium">{conv.naturalLine}</div>
                  <div className="text-muted-foreground text-xs">{conv.tuLine}</div>
                </div>
              ) : (
                <span className="text-muted-foreground text-sm">—</span>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button onClick={() => setEditing(pair)} size="icon-sm" variant="ghost" aria-label="Edit swap pair">
                  <PencilIcon className="size-4" />
                </Button>
                <RemoveButton pair={pair} />
              </div>
            </TableCell>
          </>
          );
        }}
      />

      <SwapPairDialog
        key="add"
        mode="add"
        open={adding}
        onOpenChange={setAdding}
        categoryOptions={categoryOptions}
        categoryTu={categoryTu}
        planOptions={planOptions}
        mealSizeOptions={mealSizeOptions}
        plansByCategoryKey={plansByCategoryKey}
      />
      <SwapPairDialog
        key={editing?.id ?? "edit"}
        mode="edit"
        pair={editing}
        open={editing != null}
        onOpenChange={(next) => !next && setEditing(null)}
        categoryOptions={categoryOptions}
        categoryTu={categoryTu}
        planOptions={planOptions}
        mealSizeOptions={mealSizeOptions}
        plansByCategoryKey={plansByCategoryKey}
      />
    </SectionCard>
  );
}

function RemoveButton({ pair }: { pair: SwapPairRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const remove = () => {
    start(async () => {
      try {
        await removeSwapPair({ id: pair.id });
        toast.success("Swap rule removed");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove");
      }
    });
  };

  return (
    <Button onClick={remove} disabled={pending} size="icon-sm" variant="ghost" aria-label="Remove swap pair">
      <Trash2Icon className="size-4" />
    </Button>
  );
}

function SwapPairDialog({
  mode,
  pair,
  open,
  onOpenChange,
  categoryOptions,
  categoryTu,
  planOptions,
  mealSizeOptions,
  plansByCategoryKey,
}: {
  mode: "add" | "edit";
  pair?: SwapPairRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryOptions: CategoryOption[];
  categoryTu: AdminTuCategory[];
  planOptions: PlanOption[];
  mealSizeOptions: MealSizeOption[];
  plansByCategoryKey: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromCategory, setFromCategory] = React.useState(pair?.fromCategory ?? "");
  const [toCategory, setToCategory] = React.useState(pair?.toCategory ?? "");
  const [planId, setPlanId] = React.useState(pair ? (pair.planId ?? ALL_PLANS) : "");
  const [mealSizeId, setMealSizeId] = React.useState(pair?.mealSizeId ?? ALL_SIZES);
  const [receivesMissing, setReceivesMissing] = React.useState(pair?.receivesMissing ?? false);
  const tuByKey = React.useMemo(() => new Map(categoryTu.map((c) => [c.key, c])), [categoryTu]);
  const fromTu = tuByKey.get(fromCategory);
  const toTu = tuByKey.get(toCategory);
  const conversion = naturalSwapConversion(fromTu, toTu);
  const sameUnit = !!fromTu && !!toTu && fromTu.tuUnitType === toTu.tuUnitType && fromTu.tuUnitSize === toTu.tuUnitSize;
  const sizeChoices = mealSizeOptions.filter((s) => s.planId === planId);
  const [naturalFallback, setNaturalFallback] = React.useState(pair?.naturalFallback ?? true);
  const [overrides, setOverrides] = React.useState<OverrideDraft[]>(() => {
    const f = pair && tuByKey.get(pair.fromCategory);
    const t = pair && tuByKey.get(pair.toCategory);
    return f && t ? pair.exchangeOverrides.map((o) => ({ give: toNatural(f, o.giveTu), receive: toNatural(t, o.receiveTu) })) : [];
  });

  // A swap rule may be scoped to one plan, or left at "All plans". The
  // per-plan choices are only the plans both categories are attached to,
  // mirroring the composition editor's category-first, plan-second pattern —
  // "All plans" is always offered once both categories are picked.
  const scopedPlanChoices = React.useMemo(() => {
    if (!fromCategory || !toCategory) return [];
    const fromPlans = new Set(plansByCategoryKey[fromCategory] ?? []);
    const toPlans = new Set(plansByCategoryKey[toCategory] ?? []);
    return planOptions.filter((p) => fromPlans.has(p.value) && toPlans.has(p.value));
  }, [fromCategory, toCategory, plansByCategoryKey, planOptions]);

  const close = () => {
    onOpenChange(false);
    if (mode === "add") {
      setFromCategory("");
      setToCategory("");
      setPlanId("");
      setMealSizeId(ALL_SIZES);
      setReceivesMissing(false);
      setOverrides([]);
      setNaturalFallback(true);
    }
  };

  const save = () => {
    if (!fromCategory || !toCategory) {
      toast.error("Select both categories");
      return;
    }
    const resolvedPlanId = planId === ALL_PLANS || !planId ? null : planId;
    let exchangeOverrides: ExchangeOverride[] = [];
    if (overrides.length > 0) {
      if (!fromTu || !toTu) {
        toast.error("Overrides need both categories' unit settings");
        return;
      }
      const parsed = overrides.map((o) => ({ give: Number(o.give), receive: Number(o.receive) }));
      if (parsed.some((o) => !(o.give > 0) || !(o.receive > 0))) {
        toast.error("Enter a positive given and received amount on every override");
        return;
      }
      exchangeOverrides = parsed.map((o) => ({ giveTu: o.give / fromTu.tuUnitSize, receiveTu: o.receive / toTu.tuUnitSize }));
    }
    const resolvedMealSizeId = resolvedPlanId && mealSizeId !== ALL_SIZES ? mealSizeId : null;
    const rm = sameUnit && receivesMissing;
    start(async () => {
      try {
        if (mode === "add") {
          await addSwapPair({ fromCategory, toCategory, planId: resolvedPlanId, exchangeOverrides, naturalFallback, receivesMissing: rm, mealSizeId: resolvedMealSizeId });
          toast.success("Swap rule added");
        } else if (pair) {
          await editSwapPair({ id: pair.id, fromCategory, toCategory, planId: resolvedPlanId, exchangeOverrides, naturalFallback, receivesMissing: rm, mealSizeId: resolvedMealSizeId });
          toast.success("Swap rule updated");
        }
        router.refresh();
        close();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : `Failed to ${mode === "add" ? "add" : "update"}`);
      }
    });
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(next) : close())}
      title={mode === "add" ? "Add swap rule" : "Edit swap rule"}
      description="Choose which categories may exchange. Amounts follow Dish Category settings unless you add an exchange override."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : mode === "add" ? "Add rule" : "Save changes"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={fromCategory}
            onValueChange={(v) => {
              setFromCategory(v);
              setPlanId("");
              setMealSizeId(ALL_SIZES);
              setReceivesMissing(false);
              // Overrides are in the old category's units; they don't carry over.
              setOverrides([]);
            }}
          >
            <SelectTrigger className="w-40"><SelectValue placeholder="From category" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <Select
            value={toCategory}
            onValueChange={(v) => {
              setToCategory(v);
              setPlanId("");
              setMealSizeId(ALL_SIZES);
              setReceivesMissing(false);
              setOverrides([]);
            }}
          >
            <SelectTrigger className="w-40"><SelectValue placeholder="To category" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Select value={planId} onValueChange={(v) => { setPlanId(v); setMealSizeId(ALL_SIZES); }} disabled={!fromCategory || !toCategory}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={fromCategory && toCategory ? "All plans" : "Pick both categories first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PLANS}>All plans</SelectItem>
            {scopedPlanChoices.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={mealSizeId} onValueChange={setMealSizeId} disabled={!planId || planId === ALL_PLANS}>
          <SelectTrigger className="w-full" aria-label="Meal size"><SelectValue placeholder="All meal sizes" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SIZES}>All meal sizes</SelectItem>
            {sizeChoices.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">Allow when the meal doesn&apos;t have it</p>
            <p className="text-xs text-muted-foreground">Customers can swap into this even if their meal size has no row for it. Same unit only.</p>
          </div>
          <Switch checked={sameUnit && receivesMissing} onCheckedChange={setReceivesMissing} disabled={!sameUnit} aria-label="Allow when the meal doesn't have it" />
        </div>
        {conversion ? (
          <div className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Based on current category configuration</p>
            <p className="mt-1 font-medium">{conversion.naturalLine}</p>
            <p className="text-muted-foreground text-xs">TU exchange: {conversion.tuLine}</p>
          </div>
        ) : fromCategory && toCategory ? (
          <p className="text-muted-foreground text-sm">Natural conversion unavailable — check each category&apos;s TU settings.</p>
        ) : null}
        {fromTu && toTu ? (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium">Exchange overrides</p>
              <p className="text-muted-foreground text-xs">
                {overrides.length === 0
                  ? "Natural exchange. Add a line to change what one given portion buys."
                  : "Each line sets what one given amount buys."}
              </p>
            </div>
            {overrides.map((o, i) => {
              const set = (patch: Partial<OverrideDraft>) =>
                setOverrides((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              return (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    type="number" inputMode="decimal" min={0} step="any" className="w-20"
                    aria-label={`Given ${fromTu.label}`} value={o.give} onChange={(e) => set({ give: e.target.value })}
                  />
                  <span className="text-muted-foreground w-12 text-sm">{unitOf(fromTu)}</span>
                  <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  <Input
                    type="number" inputMode="decimal" min={0} step="any" className="w-20"
                    aria-label={`Received ${toTu.label}`} value={o.receive} onChange={(e) => set({ receive: e.target.value })}
                  />
                  <span className="text-muted-foreground w-12 text-sm">{unitOf(toTu)}</span>
                  <Button
                    size="icon-sm" variant="ghost" aria-label="Remove override"
                    onClick={() => setOverrides((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              );
            })}
            <Button size="sm" variant="outline" onClick={() => setOverrides((prev) => [...prev, { give: "", receive: "" }])}>
              <PlusIcon data-icon="inline-start" /> Add override
            </Button>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-sm font-medium">Other amounts</span>
              <Select value={naturalFallback ? "natural" : "blocked"} onValueChange={(v) => setNaturalFallback(v === "natural")}>
                <SelectTrigger className="w-48" aria-label="Other amounts"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="natural">Natural exchange</SelectItem>
                  <SelectItem value="blocked">Not allowed</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-muted-foreground text-xs">
                {naturalFallback ? "An amount without a line swaps at the category rate." : "Only the amounts listed above can be swapped."}
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
