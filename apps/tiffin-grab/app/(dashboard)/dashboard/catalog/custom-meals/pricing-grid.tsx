"use client";

import * as React from "react";
import { toast } from "sonner";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
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

const PAGE_SIZE = 10;

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "unpriced", label: "Not priced" },
  { value: "offered", label: "Offered" },
  { value: "hidden", label: "Priced, not offered" },
] as const;
type Status = (typeof STATUSES)[number]["value"];

const matchesStatus = (r: PricingGridRow, status: Status) =>
  status === "all" ||
  (status === "unpriced" && r.pricePerTu == null) ||
  (status === "offered" && r.pricePerTu != null && r.active) ||
  (status === "hidden" && r.pricePerTu != null && !r.active);

export function PricingGrid({ rows }: { rows: PricingGridRow[] }) {
  const [query, setQuery] = React.useState("");
  const [diet, setDiet] = React.useState("all");
  const [status, setStatus] = React.useState<Status>("all");
  const [page, setPage] = React.useState(0);

  const diets = [...new Map(rows.map((r) => [r.planKey, r.planName])).entries()];
  const q = query.trim().toLowerCase();
  const filtered = rows.filter((r) =>
    (!q || r.categoryLabel.toLowerCase().includes(q)) &&
    (diet === "all" || r.planKey === diet) &&
    matchesStatus(r, status));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };

  return (
    <SectionCard
      title="Custom meal pricing"
      subtitle="Price per TU for each category and diet. Rows with Offered off are hidden from the custom meal builder. Leave Max TU empty for no cap."
    >
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label="Search categories"
          placeholder="Search categories…"
          className="min-h-11 sm:min-h-9 sm:max-w-64"
          value={query}
          onChange={(e) => filter(setQuery)(e.target.value)}
        />
        <Select value={diet} onValueChange={filter(setDiet)}>
          <SelectTrigger aria-label="Diet" className="min-h-11 sm:min-h-9 sm:w-48">
            <SelectValue>{diets.find(([key]) => key === diet)?.[1] ?? "All diets"}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All diets</SelectItem>
            {diets.map(([key, name]) => <SelectItem key={key} value={key}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={filter((v: string) => setStatus(v as Status))}>
          <SelectTrigger aria-label="Status" className="min-h-11 sm:min-h-9 sm:w-48">
            <SelectValue>{STATUSES.find((st) => st.value === status)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((st) => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className={`${COLS} text-muted-foreground hidden border-b pb-2 text-xs font-medium uppercase tracking-wide`}>
        <span>Category</span>
        <span>Diet</span>
        <span>Price per TU</span>
        <span>Max TU</span>
        <span>Offered</span>
        <span />
      </div>
      <div className="divide-y">
        {shown.map((r) => (
          <PricingRow key={`${r.categoryKey}:${r.planKey}`} row={r} />
        ))}
        {shown.length === 0 && <p className="text-muted-foreground py-6 text-center text-sm">No rows match these filters.</p>}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3 text-sm">
        <span className="text-muted-foreground nums">
          {filtered.length === 0 ? "0" : `${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + shown.length}`} of {filtered.length}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" disabled={current === 0} onClick={() => setPage(current - 1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
            Next
          </Button>
        </div>
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
      const r = await saveCustomMealPricing({ categoryKey: row.categoryKey, planKey: row.planKey, pricePerTu, maxTu: max, active });
      if ("error" in r) toast.error(r.error);
      else toast.success(`${row.categoryLabel} · ${row.planName} saved`);
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
