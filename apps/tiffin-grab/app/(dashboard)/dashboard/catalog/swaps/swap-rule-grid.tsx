"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftRightIcon, ArrowRightIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { SectionCard, DataTable, ResponsiveDialog, type Column } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { addSwapPair, removeSwapPair } from "./actions";
import { naturalSwapConversion, type AdminTuCategory } from "../admin-tu-hints";

export type CategoryOption = { key: string; label: string };
export type SwapPairRow = {
  id: string; // pair publicId
  fromCategory: string;
  fromLabel: string;
  toCategory: string;
  toLabel: string;
};

type Cols = "pair" | "exchange" | "actions";
const COLUMNS: readonly Column<Cols>[] = [
  { key: "pair", label: "Swap" },
  { key: "exchange", label: "Natural exchange" },
  { key: "actions", label: "", align: "right" },
];

export function SwapPairGrid({
  categoryOptions,
  categoryTu,
  pairs,
}: {
  categoryOptions: CategoryOption[];
  categoryTu: AdminTuCategory[];
  pairs: SwapPairRow[];
}) {
  const [adding, setAdding] = React.useState(false);
  const tuByKey = new Map(categoryTu.map((c) => [c.key, c]));

  return (
    <SectionCard
      title="Swap rules"
      subtitle="One direction per row — Roti → Rice does not create Rice → Roti. Whether a swap actually runs on a given order's plan depends on that plan having a dish in the target category — see Dishes."
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
              <RemoveButton pair={pair} />
            </TableCell>
          </>
          );
        }}
      />

      <AddSwapPairDialog
        open={adding}
        onOpenChange={setAdding}
        categoryOptions={categoryOptions}
        categoryTu={categoryTu}
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

function AddSwapPairDialog({
  open,
  onOpenChange,
  categoryOptions,
  categoryTu,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryOptions: CategoryOption[];
  categoryTu: AdminTuCategory[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromCategory, setFromCategory] = React.useState("");
  const [toCategory, setToCategory] = React.useState("");
  const tuByKey = new Map(categoryTu.map((c) => [c.key, c]));
  const conversion = naturalSwapConversion(tuByKey.get(fromCategory), tuByKey.get(toCategory));

  const close = () => {
    onOpenChange(false);
    setFromCategory("");
    setToCategory("");
  };

  const save = () => {
    if (!fromCategory || !toCategory) {
      toast.error("Select both categories");
      return;
    }
    start(async () => {
      try {
        await addSwapPair({ fromCategory, toCategory });
        toast.success("Swap rule added");
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
      title="Add swap rule"
      description="Choose which categories may exchange. Natural amounts are calculated from Dish Category settings — you do not enter a conversion ratio."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending ? "Adding…" : "Add rule"}
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
