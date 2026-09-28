"use client";

import * as React from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Switch } from "@foundry/ui/switch";
import { saveCustomMealPricing } from "./actions";

export type PricingGridRow = {
  categoryKey: string;
  categoryLabel: string;
  unitHint: string;
  planKey: string;
  planName: string;
  pricePerTu: number | null;
  maxTu: number | null;
  active: boolean;
};

const COLS = "sm:grid sm:grid-cols-[1.4fr_1fr_8rem_7rem_5rem_5rem] sm:items-center sm:gap-3";

export function PricingGrid({ rows }: { rows: PricingGridRow[] }) {
  return (
    <SectionCard
      title="Custom meal pricing"
      subtitle="Price per TU for each category and diet. Rows with Offered off are hidden from the custom meal builder. Leave Max TU empty for no cap."
    >
      <div className={`${COLS} text-muted-foreground hidden border-b pb-2 text-xs font-medium uppercase tracking-wide`}>
        <span>Category</span>
        <span>Diet</span>
        <span>Price per TU</span>
        <span>Max TU</span>
        <span>Offered</span>
        <span />
      </div>
      <div className="divide-y">
        {rows.map((r) => (
          <PricingRow key={`${r.categoryKey}:${r.planKey}`} row={r} />
        ))}
      </div>
    </SectionCard>
  );
}

function PricingRow({ row }: { row: PricingGridRow }) {
  const [price, setPrice] = React.useState(row.pricePerTu?.toString() ?? "");
  const [maxTu, setMaxTu] = React.useState(row.maxTu?.toString() ?? "");
  const [active, setActive] = React.useState(row.active);
  const [pending, start] = React.useTransition();
  const id = `${row.categoryKey}-${row.planKey}`;

  const save = () => {
    const pricePerTu = Number(price);
    if (price.trim() === "" || !(pricePerTu > 0)) {
      toast.error("Enter a positive price per TU");
      return;
    }
    const max = maxTu.trim() === "" ? null : Number(maxTu);
    if (max !== null && !(max > 0)) {
      toast.error("Max TU must be positive, or empty for no cap");
      return;
    }
    start(async () => {
      try {
        await saveCustomMealPricing({ categoryKey: row.categoryKey, planKey: row.planKey, pricePerTu, maxTu: max, active });
        toast.success(`${row.categoryLabel} · ${row.planName} saved`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className={`${COLS} grid grid-cols-2 gap-3 py-3`}>
      <div className="col-span-2 sm:col-span-1">
        <div className="text-sm font-medium">{row.categoryLabel}</div>
        <div className="text-muted-foreground text-xs">{row.unitHint}</div>
      </div>
      <div className="col-span-2 text-sm sm:col-span-1">{row.planName}</div>
      <label className="space-y-1 sm:space-y-0">
        <span className="text-muted-foreground text-xs sm:sr-only">Price per TU</span>
        <Input id={`${id}-price`} type="number" inputMode="decimal" min={0} step="0.01" placeholder="$" value={price} onChange={(e) => setPrice(e.target.value)} />
      </label>
      <label className="space-y-1 sm:space-y-0">
        <span className="text-muted-foreground text-xs sm:sr-only">Max TU</span>
        <Input id={`${id}-max`} type="number" inputMode="decimal" min={0} step="0.5" placeholder="No cap" value={maxTu} onChange={(e) => setMaxTu(e.target.value)} />
      </label>
      <label className="flex items-center gap-2">
        <Switch id={`${id}-active`} checked={active} onCheckedChange={(v) => setActive(v)} />
        <span className="text-sm sm:sr-only">Offered</span>
      </label>
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
