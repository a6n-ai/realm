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

function PlanDot({ color }: { color: string | null }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      aria-hidden
    />
  );
}

export function SwapPairGrid({
  categoryOptions,
  planOptions,
  pairs,
  unreachableByKey,
}: {
  categoryOptions: CategoryOption[];
  planOptions: PlanOption[];
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
      subtitle="A swap is a flat 1 TU for 1 TU trade — the customer picks how many, per delivery day."
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
        unreachableByKey={unreachableByKey}
      />

      {editingScope ? (
        <PlanScopeDialog
          pair={editingScope}
          planOptions={planOptions}
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

function PlanChecklist({
  planOptions,
  selected,
  onToggle,
}: {
  planOptions: PlanOption[];
  selected: Set<string>;
  onToggle: (publicId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        Leave every plan unchecked to allow this swap on any plan that has both categories.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {planOptions.map((plan) => (
          <label
            key={plan.publicId}
            className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm"
          >
            <input
              type="checkbox"
              checked={selected.has(plan.publicId)}
              onChange={() => onToggle(plan.publicId)}
              className="size-4 accent-primary"
            />
            <PlanDot color={plan.tagColor} />
            {plan.name}
          </label>
        ))}
      </div>
    </div>
  );
}

function AddSwapPairDialog({
  open,
  onOpenChange,
  categoryOptions,
  planOptions,
  unreachableByKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryOptions: CategoryOption[];
  planOptions: PlanOption[];
  unreachableByKey: Record<string, boolean>;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromCategory, setFromCategory] = React.useState("");
  const [toCategory, setToCategory] = React.useState("");
  const [planIds, setPlanIds] = React.useState<Set<string>>(new Set());

  const close = () => {
    onOpenChange(false);
    setFromCategory("");
    setToCategory("");
    setPlanIds(new Set());
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
    start(async () => {
      try {
        await addSwapPair({ fromCategory, toCategory, planIds: [...planIds] });
        toast.success("Swap pair added");
        router.refresh();
        close();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add");
      }
    });
  };

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
          <Select value={fromCategory} onValueChange={setFromCategory}>
            <SelectTrigger className="w-40"><SelectValue placeholder="From category" /></SelectTrigger>
            <SelectContent>
              {categoryOptions.map((c) => (
                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ArrowRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <Select value={toCategory} onValueChange={setToCategory}>
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
        <PlanChecklist planOptions={planOptions} selected={planIds} onToggle={togglePlan} />
      </div>
    </ResponsiveDialog>
  );
}

function PlanScopeDialog({
  pair,
  planOptions,
  onOpenChange,
}: {
  pair: SwapPairRow;
  planOptions: PlanOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [planIds, setPlanIds] = React.useState<Set<string>>(new Set(pair.plans));

  const togglePlan = (publicId: string) =>
    setPlanIds((prev) => {
      const next = new Set(prev);
      if (next.has(publicId)) next.delete(publicId);
      else next.add(publicId);
      return next;
    });

  const save = () => {
    start(async () => {
      try {
        await setSwapPairPlans({ id: pair.id, planIds: [...planIds] });
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
      description="Choose which plans this swap is eligible on."
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
        <PlanChecklist planOptions={planOptions} selected={planIds} onToggle={togglePlan} />
      </div>
    </ResponsiveDialog>
  );
}
