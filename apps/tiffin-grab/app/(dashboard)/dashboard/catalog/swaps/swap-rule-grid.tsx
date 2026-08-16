"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@realm/ui/button";
import { Label } from "@realm/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { NumberField } from "../../discounts/controls";
import { addSwapRule, removeSwapRule } from "./actions";

export type CategoryOption = { key: string; label: string };
export type SwapRuleRow = {
  id: string; // rule publicId
  fromCategory: string;
  fromLabel: string;
  qtyFrom: number;
  toCategory: string;
  toLabel: string;
  qtyTo: number;
  toWeightValue: number | null;
  toWeightUnit: string | null;
};

export function SwapRuleGrid({
  mealSizePublicId,
  mealSizeName,
  categoryOptions,
  rules,
}: {
  mealSizePublicId: string;
  mealSizeName: string;
  categoryOptions: CategoryOption[];
  rules: SwapRuleRow[];
}) {
  const [adding, setAdding] = React.useState(false);

  return (
    <SectionCard
      title={mealSizeName}
      subtitle={rules.length === 0 ? "No swaps configured yet." : undefined}
      action={
        <Button size="sm" variant="outline" onClick={() => setAdding((a) => !a)}>
          {adding ? "Cancel" : "+ Add swap"}
        </Button>
      }
    >
      <div className="grid gap-3">
        {rules.map((rule) => (
          <SwapRuleRowView key={rule.id} rule={rule} />
        ))}
        {rules.length === 0 && !adding && (
          <p className="text-muted-foreground text-sm">No swaps configured for this meal size yet.</p>
        )}
        {adding && (
          <AddSwapRuleForm
            mealSizePublicId={mealSizePublicId}
            categoryOptions={categoryOptions}
            onDone={() => setAdding(false)}
          />
        )}
      </div>
    </SectionCard>
  );
}

function SwapRuleRowView({ rule }: { rule: SwapRuleRow }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  const remove = () => {
    start(async () => {
      try {
        await removeSwapRule({ id: rule.id });
        toast.success("Swap rule removed");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to remove");
      }
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
      <span className="text-sm font-medium">
        {rule.qtyFrom} {rule.fromLabel} <span className="text-muted-foreground">→</span> {rule.qtyTo} {rule.toLabel}
        {rule.toWeightValue != null && rule.toWeightUnit != null ? (
          <span className="text-muted-foreground"> ({rule.toWeightValue}{rule.toWeightUnit})</span>
        ) : null}
      </span>
      <Button onClick={remove} disabled={pending} size="sm" variant="ghost">
        Remove
      </Button>
    </div>
  );
}

function AddSwapRuleForm({
  mealSizePublicId,
  categoryOptions,
  onDone,
}: {
  mealSizePublicId: string;
  categoryOptions: CategoryOption[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [fromCategory, setFromCategory] = React.useState("");
  const [qtyFrom, setQtyFrom] = React.useState("1");
  const [toCategory, setToCategory] = React.useState("");
  const [qtyTo, setQtyTo] = React.useState("1");
  const [portionValue, setPortionValue] = React.useState("");
  const [portionUnit, setPortionUnit] = React.useState("");

  const save = () => {
    if (!fromCategory || !toCategory) {
      toast.error("Select both categories");
      return;
    }
    if (fromCategory === toCategory) {
      toast.error("Pick two different categories");
      return;
    }
    const nFrom = parseInt(qtyFrom, 10);
    const nTo = parseInt(qtyTo, 10);
    if (!Number.isFinite(nFrom) || nFrom <= 0 || !Number.isFinite(nTo) || nTo <= 0) {
      toast.error("Quantities must be positive integers");
      return;
    }
    const portion = portionValue.trim() === "" ? null : Number(portionValue);
    if (portion != null && (!Number.isFinite(portion) || portion <= 0)) {
      toast.error("Portion must be a positive number");
      return;
    }
    if ((portion == null) !== (portionUnit === "")) {
      toast.error("A portion needs both an amount and a unit");
      return;
    }
    start(async () => {
      try {
        await addSwapRule({ mealSizePublicId, fromCategory, qtyFrom: nFrom, toCategory, qtyTo: nTo, toWeightValue: portion, toWeightUnit: portionUnit === "" ? null : portionUnit });
        toast.success("Swap rule added");
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
        <div className="grid gap-1.5">
          <Label>Give up</Label>
          <div className="flex gap-2">
            <NumberField id="swap-qty-from" label="" min={1} step={1} value={qtyFrom} onChange={setQtyFrom} className="w-16" />
            <Select value={fromCategory} onValueChange={setFromCategory}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <span className="text-muted-foreground pb-2">→</span>
        <div className="grid gap-1.5">
          <Label>Receive</Label>
          <div className="flex gap-2">
            <NumberField id="swap-qty-to" label="" min={1} step={1} value={qtyTo} onChange={setQtyTo} className="w-16" />
            <Select value={toCategory} onValueChange={setToCategory}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                {categoryOptions.map((c) => (
                  <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label>Portion (optional)</Label>
          <div className="flex gap-2">
            <NumberField id="swap-portion-value" label="" min={0} step={1} value={portionValue} onChange={setPortionValue} className="w-20" />
            <Select value={portionUnit} onValueChange={setPortionUnit}>
              <SelectTrigger className="w-24"><SelectValue placeholder="Unit" /></SelectTrigger>
              <SelectContent>
                {["oz", "g", "ml", "piece"].map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={save} disabled={pending} size="sm">
          Add
        </Button>
      </div>
    </div>
  );
}
