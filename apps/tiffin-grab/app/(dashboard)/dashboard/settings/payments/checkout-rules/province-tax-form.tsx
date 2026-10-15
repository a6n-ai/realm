"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPinIcon, PencilIcon, PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { DataTable, ResponsiveDialog, RowActionTooltipButton, SectionCard, TonePill, type Column } from "@/components/ds";
import {
  DEFAULT_PROVINCE_TAXES,
  PROVINCES,
  PROVINCE_LABEL,
  type Province,
} from "@/lib/tax/canada";
import { setProvinceTaxesAction } from "./actions";

type TaxLine = { name: string; ratePct: number };
type Line = { name: string; rate: string };
type Row = { province: Province; lines: TaxLine[]; custom: boolean };

const MAX_LINES = 4;

const COLUMNS: readonly Column<"province" | "lines" | "total" | "source" | "edit">[] = [
  { key: "province", label: "Province" },
  { key: "lines", label: "Tax lines" },
  { key: "total", label: "Total", align: "right" },
  { key: "source", label: "Rates" },
  { key: "edit", label: "", align: "right", width: "3.5rem" },
];

function toDraft(lines: TaxLine[]): Line[] {
  return lines.map((l) => ({ name: l.name, rate: String(l.ratePct) }));
}

function sameLines(a: TaxLine[], b: TaxLine[]): boolean {
  return a.length === b.length && a.every((l, i) => l.name === b[i]!.name && l.ratePct === b[i]!.ratePct);
}

const totalPct = (lines: TaxLine[]) => Math.round(lines.reduce((s, l) => s + l.ratePct, 0) * 1000) / 1000;

function LinePills({ lines }: { lines: TaxLine[] }) {
  if (lines.length === 0) return <span className="text-muted-foreground">No tax</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {lines.map((l, i) => (
        <TonePill key={i} tone="neutral">
          {l.name} {l.ratePct}%
        </TonePill>
      ))}
    </div>
  );
}

export function ProvinceTaxForm({ overrides }: { overrides: Record<string, TaxLine[]> }) {
  const [editing, setEditing] = React.useState<Row | null>(null);

  const rows: Row[] = PROVINCES.map((p) => {
    const lines = overrides[p] ?? DEFAULT_PROVINCE_TAXES[p];
    return { province: p, lines, custom: !sameLines(lines, DEFAULT_PROVINCE_TAXES[p]) };
  });

  return (
    <SectionCard
      title="Sales tax by province"
      subtitle="Tax is charged by the delivery address's province, on the order total after discounts and coins. Defaults are standard GST/HST/PST rates — confirm with your accountant whether prepared meals are taxable in each province, and set a line to 0% if it doesn't apply."
    >
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.province}
        serial={false}
        onRowClick={setEditing}
        emptyIcon={MapPinIcon}
        emptyMessage="No provinces."
        renderRow={(r) => (
          <>
            <TableCell>
              <div className="font-medium">{PROVINCE_LABEL[r.province]}</div>
              <div className="text-muted-foreground text-xs">{r.province}</div>
            </TableCell>
            <TableCell className="whitespace-normal">
              <LinePills lines={r.lines} />
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums">{totalPct(r.lines)}%</TableCell>
            <TableCell>
              <TonePill tone={r.custom ? "brand" : "faint"}>{r.custom ? "Custom" : "Default"}</TonePill>
            </TableCell>
            <TableCell className="text-right">
              <RowActionTooltipButton icon={PencilIcon} label={`Edit ${PROVINCE_LABEL[r.province]}`} onClick={() => setEditing(r)} />
            </TableCell>
          </>
        )}
        mobileCard={(r) => (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{PROVINCE_LABEL[r.province]}</span>
              <span className="font-medium tabular-nums">{totalPct(r.lines)}%</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <LinePills lines={r.lines} />
              <TonePill tone={r.custom ? "brand" : "faint"}>{r.custom ? "Custom" : "Default"}</TonePill>
            </div>
          </div>
        )}
      />
      {editing ? (
        <EditProvinceDialog
          key={editing.province}
          row={editing}
          overrides={overrides}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </SectionCard>
  );
}

function EditProvinceDialog({
  row,
  overrides,
  onClose,
}: {
  row: Row;
  overrides: Record<string, TaxLine[]>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [lines, setLines] = React.useState<Line[]>(() => toDraft(row.lines));
  const p = row.province;
  const label = PROVINCE_LABEL[p];

  const patch = (i: number, next: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...next } : l)));

  const save = () => {
    const parsed: TaxLine[] = [];
    for (const l of lines) {
      const rate = Number(l.rate);
      if (!l.name.trim()) return toast.error("Every tax line needs a name");
      if (l.rate.trim() === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
        return toast.error(`${l.name || "A line"} needs a rate from 0 to 100`);
      }
      parsed.push({ name: l.name.trim(), ratePct: rate });
    }
    // Store only provinces that differ from the defaults, so a province nobody
    // touched keeps following DEFAULT_PROVINCE_TAXES if those defaults change.
    const { [p]: _, ...rest } = overrides;
    const payload = sameLines(parsed, DEFAULT_PROVINCE_TAXES[p]) ? rest : { ...rest, [p]: parsed };
    start(async () => {
      try {
        await setProvinceTaxesAction(payload);
        toast.success(`${label} tax saved`);
        onClose();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${label} sales tax`}
      description="Charged on orders delivered here. Set a line to 0% or remove it if it doesn't apply."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-2">
        {lines.length === 0 ? <p className="text-muted-foreground text-sm">No tax lines — orders here carry no tax.</p> : null}
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={`Tax line ${i + 1} name`}
              placeholder="GST"
              className="h-9 w-28"
              value={l.name}
              onChange={(e) => patch(i, { name: e.target.value })}
            />
            <div className="relative">
              <Input
                aria-label={`Tax line ${i + 1} rate`}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step="any"
                className="h-9 w-28 pr-7 tabular-nums"
                value={l.rate}
                onChange={(e) => patch(i, { rate: e.target.value })}
              />
              <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs">%</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label={`Remove ${l.name || "line"}`}
              onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
            >
              <XIcon className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2 pt-1">
          {lines.length < MAX_LINES ? (
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setLines((ls) => [...ls, { name: "", rate: "" }])}>
              <PlusIcon className="size-3.5" /> Add line
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => setLines(toDraft(DEFAULT_PROVINCE_TAXES[p]))}>
            <RotateCcwIcon className="size-3.5" /> Reset to default
          </Button>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
