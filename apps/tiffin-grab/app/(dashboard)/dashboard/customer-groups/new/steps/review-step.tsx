"use client";

import { UsersIcon } from "lucide-react";
import { DataTable } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Badge } from "@/components/reui/badge";
import { TableCell } from "@foundry/ui/table";
import { AccountSearch, type AccountResult } from "../account-search";
import type { Candidate } from "../types";

const COLUMNS = [
  { key: "pick", label: "", width: "3rem" },
  { key: "name", label: "Customer" },
  { key: "contact", label: "Contact" },
  { key: "revenue", label: "Revenue", align: "right" },
  { key: "since", label: "Ordering since" },
  { key: "last", label: "Last tiffin" },
] as const;

const money = (v: string) => `$${Number(v).toFixed(2)}`;

export function toCandidate(a: AccountResult): Candidate {
  return { publicId: a.publicId, name: a.fullName, phone: a.phone, email: a.email, revenue: "0", firstOrderDate: "-", lastTiffin: null, added: true };
}

export function ReviewStep({
  rows,
  selected,
  onSelectedChange,
  onAdd,
  onBack,
  onNext,
}: {
  rows: Candidate[];
  selected: Set<string>;
  onSelectedChange: (s: Set<string>) => void;
  onAdd: (c: Candidate) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedChange(next);
  };
  const allOn = rows.length > 0 && selected.size === rows.length;

  return (
    <div className="flex flex-col gap-4">
      <AccountSearch
        placeholder="Add a customer by name, phone or email"
        exclude={new Set(rows.map((r) => r.publicId))}
        onPick={(a) => onAdd(toCandidate(a))}
      />
      <DataTable
        pagination="client"
        pageSize={25}
        serial={false}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        emptyIcon={UsersIcon}
        emptyMessage="No customers match these filters"
        emptyAction={<Button variant="outline" onClick={onBack}>Change filters</Button>}
        actions={
          rows.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => onSelectedChange(allOn ? new Set() : new Set(rows.map((r) => r.publicId)))}>
              {allOn ? "Deselect all" : "Select all"}
            </Button>
          )
        }
        renderRow={(r) => (
          <>
            <TableCell>
              <input
                type="checkbox"
                aria-label={`Select ${r.name ?? "customer"}`}
                checked={selected.has(r.publicId)}
                onChange={() => toggle(r.publicId)}
                className="accent-primary size-4"
              />
            </TableCell>
            <TableCell className="font-medium">{r.name ?? "Customer"}</TableCell>
            <TableCell className="text-muted-foreground">{r.phone ?? r.email ?? "-"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.added ? <Badge variant="secondary">Added</Badge> : money(r.revenue)}</TableCell>
            <TableCell className="tabular-nums">{r.added ? "" : r.firstOrderDate}</TableCell>
            <TableCell className="tabular-nums">{r.added ? "" : (r.lastTiffin ?? "-")}</TableCell>
          </>
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {selected.size} of {rows.length} selected
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>Back</Button>
          <Button onClick={onNext} disabled={selected.size === 0}>Next</Button>
        </div>
      </div>
    </div>
  );
}
