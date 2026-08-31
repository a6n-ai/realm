"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { addSwapPair, removeSwapPair } from "./actions";

export type CategoryOption = { key: string; label: string };
export type SwapPairRow = {
  id: string; // pair publicId
  fromCategory: string;
  fromLabel: string;
  toCategory: string;
  toLabel: string;
};

// Global — a pair is either ever-swappable or it isn't, for every meal size that
// has both categories. The per-meal-size ratio used to live here too, but a swap
// is a flat 1 TU-for-1 TU trade now, so there's nothing meal-size-specific left
// to configure — how many picks to give up is chosen by the customer at apply
// time (see app/(customer)/me/deliveries/day-detail.tsx).
export function SwapPairGrid({
  categoryOptions,
  pairs,
}: {
  categoryOptions: CategoryOption[];
  pairs: SwapPairRow[];
}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <SectionCard
      title="Swap-eligible category pairs"
      subtitle={pairs.length === 0 ? "No pairs configured yet." : undefined}
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add pair"}
        </Button>
      }
    >
      <div className="grid gap-3">
        {pairs.map((pair) => (
          <SwapPairRowView key={pair.id} pair={pair} />
        ))}
        {pairs.length === 0 && !adding && (
          <p className="text-muted-foreground text-sm">No swap pairs configured yet.</p>
        )}
        {adding && (
          <AddSwapPairForm categoryOptions={categoryOptions} onDone={() => setAdding(false)} />
        )}
      </div>
    </SectionCard>
  );
}

function SwapPairRowView({ pair }: { pair: SwapPairRow }) {
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
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-sm font-medium">
        {pair.fromLabel} <span className="text-muted-foreground">→</span> {pair.toLabel}
      </span>
      <Button onClick={remove} disabled={pending} size="sm" variant="ghost">
        Remove
      </Button>
    </div>
  );
}

function AddSwapPairForm({
  categoryOptions,
  onDone,
}: {
  categoryOptions: CategoryOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromCategory, setFromCategory] = React.useState("");
  const [toCategory, setToCategory] = React.useState("");

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
        await addSwapPair({ fromCategory, toCategory });
        toast.success("Swap pair added");
        router.refresh();
        onDone();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to add");
      }
    });
  };

  return (
    <div className="rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={fromCategory} onValueChange={setFromCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="From category" /></SelectTrigger>
          <SelectContent>
            {categoryOptions.map((c) => (
              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground pb-2">→</span>
        <Select value={toCategory} onValueChange={setToCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="To category" /></SelectTrigger>
          <SelectContent>
            {categoryOptions.map((c) => (
              <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={save} disabled={pending} size="sm">
          Add
        </Button>
      </div>
    </div>
  );
}
