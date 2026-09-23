"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRightIcon, ArrowRightIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SectionCard, DataTable, ResponsiveDialog, type Column } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { addSwapPair, editSwapPair, removeSwapPair } from "./actions";
import { naturalSwapConversion, type AdminTuCategory } from "../admin-tu-hints";

export type CategoryOption = { key: string; label: string };
export type PlanOption = { value: string; label: string };
export type SwapPairRow = {
  id: string; // pair publicId
  fromCategory: string;
  fromLabel: string;
  toCategory: string;
  toLabel: string;
  // Null = the rule applies to every plan.
  planId: string | null;
  planName: string;
};

// Radix Select rejects an empty-string item value, so "all plans" needs a
// real sentinel — translated back to null at the service-call boundary.
const ALL_PLANS = "__all_plans__";

type Cols = "pair" | "plan" | "exchange" | "actions";
const COLUMNS: readonly Column<Cols>[] = [
  { key: "pair", label: "Swap" },
  { key: "plan", label: "Plan" },
  { key: "exchange", label: "Natural exchange" },
  { key: "actions", label: "", align: "right" },
];

export function SwapPairGrid({
  categoryOptions,
  categoryTu,
  planOptions,
  plansByCategoryKey,
  pairs,
}: {
  categoryOptions: CategoryOption[];
  categoryTu: AdminTuCategory[];
  planOptions: PlanOption[];
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
        columns={COLUMNS}
        rows={pairs}
        rowKey={(p) => p.id}
        serial={false}
        emptyIcon={ArrowLeftRightIcon}
        emptyMessage="No swap rules configured yet."
        renderRow={(pair) => {
          const conv = naturalSwapConversion(tuByKey.get(pair.fromCategory), tuByKey.get(pair.toCategory));
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
              <span className="text-sm">{pair.planName}</span>
            </TableCell>
            <TableCell>
              {conv ? (
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
  plansByCategoryKey,
}: {
  mode: "add" | "edit";
  pair?: SwapPairRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryOptions: CategoryOption[];
  categoryTu: AdminTuCategory[];
  planOptions: PlanOption[];
  plansByCategoryKey: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromCategory, setFromCategory] = React.useState(pair?.fromCategory ?? "");
  const [toCategory, setToCategory] = React.useState(pair?.toCategory ?? "");
  const [planId, setPlanId] = React.useState(pair ? (pair.planId ?? ALL_PLANS) : "");
  const tuByKey = React.useMemo(() => new Map(categoryTu.map((c) => [c.key, c])), [categoryTu]);
  const conversion = naturalSwapConversion(tuByKey.get(fromCategory), tuByKey.get(toCategory));

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
    }
  };

  const save = () => {
    if (!fromCategory || !toCategory) {
      toast.error("Select both categories");
      return;
    }
    const resolvedPlanId = planId === ALL_PLANS || !planId ? null : planId;
    start(async () => {
      try {
        if (mode === "add") {
          await addSwapPair({ fromCategory, toCategory, planId: resolvedPlanId });
          toast.success("Swap rule added");
        } else if (pair) {
          await editSwapPair({ id: pair.id, fromCategory, toCategory, planId: resolvedPlanId });
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
      description="Choose which categories may exchange. Natural amounts are calculated from Dish Category settings — you do not enter a conversion ratio."
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
      <div className="space-y-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={fromCategory}
            onValueChange={(v) => {
              setFromCategory(v);
              setPlanId("");
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
        <Select value={planId} onValueChange={setPlanId} disabled={!fromCategory || !toCategory}>
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
        {conversion ? (
          <div className="bg-muted/40 rounded-lg border px-3 py-2 text-sm">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Based on current category configuration</p>
            <p className="mt-1 font-medium">{conversion.naturalLine}</p>
            <p className="text-muted-foreground text-xs">TU exchange: {conversion.tuLine}</p>
          </div>
        ) : fromCategory && toCategory ? (
          <p className="text-muted-foreground text-sm">Natural conversion unavailable — check each category&apos;s TU settings.</p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}
