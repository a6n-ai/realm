"use client";

import * as React from "react";
import { toast } from "sonner";
import { UtensilsIcon } from "lucide-react";
import { DataTable, ListPagination, SectionCard, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Switch } from "@foundry/ui/switch";
import { TableCell } from "@foundry/ui/table";
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

type Cols = "category" | "diet" | "price" | "maxTu" | "offered" | "actions";

const COLUMNS: readonly Column<Cols>[] = [
  { key: "category", label: "Category", width: "w-[26%]" },
  { key: "diet", label: "Diet", width: "w-[22%]" },
  { key: "price", label: "Price per TU", width: "w-[16%]" },
  { key: "maxTu", label: "Max TU", width: "w-[16%]" },
  { key: "offered", label: "Offered", align: "center", width: "w-[10%]" },
  { key: "actions", label: "", align: "right", width: "w-[10%]" },
];

export function PricingGrid({ rows, spec, page, size, total }: {
  rows: PricingGridRow[];
  spec: FacetDef[];
  page: number;
  size: number;
  total: number;
}) {
  return (
    <SectionCard
      title="Custom meal pricing"
      subtitle="Price per TU for each category and diet. A row counts as priced only when Offered is on. Leave Max TU empty for no cap."
    >
      <div className="space-y-4">
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => `${r.categoryKey}:${r.planKey}`}
          serial={false}
          filters={<ListSearchFilters spec={spec} placeholder="Search categories…" />}
          emptyIcon={UtensilsIcon}
          emptyMessage="No categories to price yet."
          emptySearchMessage="No rows match these filters."
          // Keyed by the saved values so a refresh after save resets the inputs.
          renderRow={(r) => <PricingCells key={`${r.pricePerTu}:${r.maxTu}:${r.active}`} row={r} />}
        />
        <ListPagination page={page} size={size} total={total} />
      </div>
    </SectionCard>
  );
}

function PricingCells({ row }: { row: PricingGridRow }) {
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
      const r = await saveCustomMealPricing({ categoryKey: row.categoryKey, planKey: row.planKey, pricePerTu, maxTu: max, active });
      if ("error" in r) toast.error(r.error);
      else toast.success(`${row.categoryLabel} · ${row.planName} saved`);
    });
  };

  return (
    <>
      <TableCell>
        <div className="text-sm font-medium">{row.categoryLabel}</div>
        <div className="text-muted-foreground text-xs">{row.unitHint}</div>
      </TableCell>
      <TableCell className="text-sm">{row.planName}</TableCell>
      <TableCell>
        <Input
          id={`${id}-price`} aria-label={`${row.categoryLabel} ${row.planName} price per TU`}
          type="number" inputMode="decimal" min={0} step="0.01" placeholder="$" className="w-full"
          value={price} onChange={(e) => setPrice(e.target.value)}
        />
      </TableCell>
      <TableCell>
        <Input
          id={`${id}-max`} aria-label={`${row.categoryLabel} ${row.planName} max TU`}
          type="number" inputMode="decimal" min={0} step="0.5" placeholder="No cap" className="w-full"
          value={maxTu} onChange={(e) => setMaxTu(e.target.value)}
        />
      </TableCell>
      <TableCell className="text-center">
        <Switch
          id={`${id}-active`} aria-label={`${row.categoryLabel} ${row.planName} offered`}
          checked={active} onCheckedChange={setActive}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </TableCell>
    </>
  );
}
