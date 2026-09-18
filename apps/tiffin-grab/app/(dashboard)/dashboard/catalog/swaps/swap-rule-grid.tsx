"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRightIcon, ArrowRightIcon, GlobeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SectionCard, DataTable, ResponsiveDialog, type Column } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { cn } from "@foundry/ui/cn";
import { addSwapPair, removeSwapPair, setSwapPairPlans } from "./actions";

export type CategoryOption = { key: string; label: string };
export type PlanOption = { publicId: string; name: string; tagColor: string | null };
export type SwapPairRow = {
  id: string; // pair publicId
  fromCategory: string;
  fromLabel: string;
  toCategory: string;
  toLabel: string;
  /** Plan publicIds this pair is restricted to. Empty = every plan with both categories. */
  plans: string[];
};

type Cols = "pair" | "scope" | "actions";
const COLUMNS: readonly Column<Cols>[] = [
  { key: "pair", label: "Swap" },
  { key: "scope", label: "Plans" },
  { key: "actions", label: "", align: "right" },
];

function PlanDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={className ? undefined : { backgroundColor: color ?? "var(--muted-foreground)" }}
      aria-hidden
    />
  );
}

/** Plans that have BOTH categories — the only plans a swap between them can ever run on. */
function eligiblePlans(fromKey: string, toKey: string, planIdsByCategory: Record<string, string[]>, planOptions: PlanOption[]): PlanOption[] {
  if (!fromKey || !toKey) return [];
  const from = new Set(planIdsByCategory[fromKey] ?? []);
  const to = new Set(planIdsByCategory[toKey] ?? []);
  return planOptions.filter((p) => from.has(p.publicId) && to.has(p.publicId));
}

export function SwapPairGrid({
  categoryOptions,
  planOptions,
  planIdsByCategory,
  pairs,
  unreachableByKey,
}: {
  categoryOptions: CategoryOption[];
  planOptions: PlanOption[];
  planIdsByCategory: Record<string, string[]>;
  pairs: SwapPairRow[];
  /** category key -> true when no restricted plan (e.g. the veg plan) offers it. */
  unreachableByKey: Record<string, boolean>;
}) {
  const [adding, setAdding] = React.useState(false);
  const [editingScope, setEditingScope] = React.useState<SwapPairRow | null>(null);
  const planByPublicId = new Map(planOptions.map((p) => [p.publicId, p]));

  return (
    <SectionCard
      title="Swap-eligible category pairs"
      subtitle="A swap is a flat 1 TU for 1 TU trade, one direction per row — Curry → Sabzi and Sabzi → Curry are separate pairs, each with its own plan scope."
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          <PlusIcon data-icon="inline-start" /> Add pair
        </Button>
      }
    >
      <DataTable
        columns={COLUMNS}
        rows={pairs}
        rowKey={(p) => p.id}
        serial={false}
        emptyIcon={ArrowLeftRightIcon}
        emptyMessage="No swap pairs configured yet."
        renderRow={(pair) => (
          <>
            <TableCell>
              <span className="flex items-center gap-2 text-sm font-medium">
                {pair.fromLabel}
                <ArrowRightIcon className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
                {pair.toLabel}
              </span>
            </TableCell>
            <TableCell>
              {pair.plans.length === 0 ? (
                <Badge variant="outline" className="gap-1.5 text-xs font-normal">
                  <GlobeIcon className="size-3" aria-hidden /> All plans
                </Badge>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {pair.plans.map((publicId) => {
                    const plan = planByPublicId.get(publicId);
                    return (
                      <Badge key={publicId} variant="secondary" className="gap-1.5 text-xs font-normal">
                        <PlanDot color={plan?.tagColor ?? null} /> {plan?.name ?? publicId}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-1">
                <Button size="icon-sm" variant="ghost" onClick={() => setEditingScope(pair)} aria-label="Edit plan scope">
                  <PencilIcon className="size-4" />
                </Button>
                <RemoveButton pair={pair} />
              </div>
            </TableCell>
          </>
        )}
      />

      <AddSwapPairDialog
        open={adding}
        onOpenChange={setAdding}
        categoryOptions={categoryOptions}
        planOptions={planOptions}
        planIdsByCategory={planIdsByCategory}
        unreachableByKey={unreachableByKey}
      />

      {editingScope ? (
        <PlanScopeDialog
          pair={editingScope}
          planOptions={planOptions}
          planIdsByCategory={planIdsByCategory}
          onOpenChange={(open) => !open && setEditingScope(null)}
        />
      ) : null}
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
        toast.success("Swap pair removed");
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

/**
 * One pill per plan that actually has BOTH categories in this pair — a plan
 * missing either category never appears, so there's nothing to misread as
 * "off means not allowed" for a plan the swap could never run on anyway.
 * A lit pill means the swap runs there; tap it off to stop offering it on
 * that one plan. This only ever scopes ONE direction — see directionLabel.
 */
function PlanChecklist({
  eligible,
  selected,
  onToggle,
  directionLabel,
}: {
  eligible: PlanOption[];
  selected: Set<string>;
  onToggle: (publicId: string) => void;
  /** e.g. "Curry → Sabzi" — makes explicit this scope is one-way. */
  directionLabel: string;
}) {
  if (eligible.length === 0) {
    return (
      <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
        No plan has both categories in <span className="font-medium">{directionLabel}</span> yet — attach both to
        the same plan in Catalog → Categories first.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="font-medium">{directionLabel}</span>
        <span className="text-muted-foreground"> runs on every lit plan below. Tap one off to stop offering it there.</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {eligible.map((plan) => {
          const active = selected.has(plan.publicId);
          return (
            <button
              key={plan.publicId}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(plan.publicId)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground line-through hover:text-foreground hover:bg-muted",
              )}
            >
              <PlanDot color={plan.tagColor} className={active ? "bg-primary-foreground" : undefined} />
              {plan.name}
            </button>
          );
        })}
      </div>
      {selected.size === 0 ? (
        <p className="text-destructive text-xs">Turn at least one plan back on, or remove this pair instead.</p>
      ) : null}
    </div>
  );
}

function AddSwapPairDialog({
  open,
  onOpenChange,
  categoryOptions,
  planOptions,
  planIdsByCategory,
  unreachableByKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryOptions: CategoryOption[];
  planOptions: PlanOption[];
  planIdsByCategory: Record<string, string[]>;
  unreachableByKey: Record<string, boolean>;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromCategory, setFromCategory] = React.useState("");
  const [toCategory, setToCategory] = React.useState("");
  const [planIds, setPlanIds] = React.useState<Set<string>>(new Set());

  const eligible = eligiblePlans(fromCategory, toCategory, planIdsByCategory, planOptions);

  // New pair defaults to running everywhere it can — every eligible plan starts
  // lit. Reset on each category change (not an effect) so switching categories
  // doesn't leave a stale selection from the previous pair.
  const pickCategory = (side: "from" | "to", key: string) => {
    const next = side === "from" ? { from: key, to: toCategory } : { from: fromCategory, to: key };
    if (side === "from") setFromCategory(key);
    else setToCategory(key);
    setPlanIds(new Set(eligiblePlans(next.from, next.to, planIdsByCategory, planOptions).map((p) => p.publicId)));
  };

  const close = () => {
    onOpenChange(false);
    setFromCategory("");
    setToCategory("");
  };

  const togglePlan = (publicId: string) =>
    setPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });

  // Same rule the server enforces in dish-categories.service.ts#addSwapPair —
  // shown here so the admin sees why before submitting, not only after a toast.
  const blocked = Boolean(
    fromCategory && toCategory && unreachableByKey[toCategory] && !unreachableByKey[fromCategory],
  );

  const save = () => {
    if (!fromCategory || !toCategory) {
      toast.error("Select both categories");
      return;
    }
    if (fromCategory === toCategory) {
      toast.error("Pick two different categories");
      return;
    }
    if (planIds.size === 0) {
      toast.error("Turn at least one plan on");
      return;
    }
    // Every eligible plan lit = unrestricted; store that as [] rather than the
    // full list so a plan added to both categories later is included for free.
    const scoped = planIds.size === eligible.length ? [] : [...planIds];
    start(async () => {
      try {
        await addSwapPair({ fromCategory, toCategory, planIds: scoped });
        toast.success("Swap pair added");
        router.refresh();
        close();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add");
      }
    });
  };

  const directionLabel = fromCategory && toCategory
    ? `${categoryOptions.find((c) => c.key === fromCategory)?.label ?? fromCategory} → ${categoryOptions.find((c) => c.key === toCategory)?.label ?? toCategory}`
    : "This swap";

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(next) : close())}
      title="Add swap pair"
      description="Customers on any meal size offering both categories may swap From into To. A restricted plan (e.g. veg) can never receive a category it doesn't offer — swap the other direction instead."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || blocked}>
            {pending ? "Adding…" : "Add pair"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={fromCategory} onValueChange={(v) => pickCategory("from", v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="From category" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <Select value={toCategory} onValueChange={(v) => pickCategory("to", v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder="To category" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {blocked && (
          <p className="text-destructive text-sm">
            "{categoryOptions.find((c) => c.key === toCategory)?.label}" isn't offered on any restricted
            plan — a restricted-plan category can't swap into it. Reverse the direction instead.
          </p>
        )}
        {fromCategory && toCategory ? (
          <PlanChecklist eligible={eligible} selected={planIds} onToggle={togglePlan} directionLabel={directionLabel} />
        ) : (
          <p className="text-muted-foreground text-sm">Pick both categories to see which plans this can run on.</p>
        )}
      </div>
    </ResponsiveDialog>
  );
}

function PlanScopeDialog({
  pair,
  planOptions,
  planIdsByCategory,
  onOpenChange,
}: {
  pair: SwapPairRow;
  planOptions: PlanOption[];
  planIdsByCategory: Record<string, string[]>;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const eligible = eligiblePlans(pair.fromCategory, pair.toCategory, planIdsByCategory, planOptions);
  // pair.plans empty means unrestricted, i.e. every eligible plan is currently lit.
  const [planIds, setPlanIds] = React.useState<Set<string>>(
    new Set(pair.plans.length ? pair.plans : eligible.map((p) => p.publicId)),
  );

  const togglePlan = (publicId: string) =>
    setPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });

  const save = () => {
    if (planIds.size === 0) {
      toast.error("Turn at least one plan on");
      return;
    }
    const scoped = planIds.size === eligible.length ? [] : [...planIds];
    start(async () => {
      try {
        await setSwapPairPlans({ id: pair.id, planIds: scoped });
        toast.success("Plan scope updated");
        router.refresh();
        onOpenChange(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update");
      }
    });
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={onOpenChange}
      title={`${pair.fromLabel} → ${pair.toLabel}`}
      description="Choose which plans this swap runs on."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="px-4 py-3">
        <PlanChecklist
          eligible={eligible}
          selected={planIds}
          onToggle={togglePlan}
          directionLabel={`${pair.fromLabel} → ${pair.toLabel}`}
        />
      </div>
    </ResponsiveDialog>
  );
}
