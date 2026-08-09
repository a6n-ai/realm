"use client";

import { useState } from "react";
import { PackageIcon, PencilIcon, PlusIcon } from "lucide-react";
import { DataTable, type Column } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { TableCell } from "@realm/ui/table";
import type { DeliveryType } from "@/lib/delivery/zones";
import { TypeEditDialog } from "./type-edit-dialog";

// Plain JSON in — publicId is always present here (rows came from a DB query).
export type TypeRow = Required<Pick<DeliveryType, "publicId">> &
  Omit<DeliveryType, "id" | "publicId">;

type TypeCol = "option" | "key" | "rules" | "order" | "status" | "actions";

const COLUMNS: readonly Column<TypeCol>[] = [
  { key: "option", label: "Option", sortable: false },
  { key: "key", label: "Key", sortable: false },
  { key: "rules", label: "Rules", sortable: false },
  { key: "order", label: "Order", sortable: false },
  { key: "status", label: "Status", sortable: false },
  { key: "actions", label: "", sortable: false, align: "right" },
];

function RulesCell({ row }: { row: TypeRow }) {
  const badges: React.ReactNode[] = [];
  if (row.minSubtotal > 0) badges.push(<Badge key="min" variant="outline">${row.minSubtotal} min</Badge>);
  if (row.discountPct > 0) badges.push(<Badge key="disc" variant="outline">{row.discountPct}% off</Badge>);
  if (row.requiresSchedule) badges.push(<Badge key="sched" variant="outline">Scheduled</Badge>);
  if (row.requiresAddress) badges.push(<Badge key="addr" variant="outline">Address</Badge>);
  if (badges.length === 0) return <span className="text-muted-foreground">—</span>;
  return <div className="flex flex-wrap gap-1">{badges}</div>;
}

// dialogMode tracks which dialog to show: closed, editing an existing row, or creating one.
// "new" is a sentinel distinct from `null` (a possible-but-unused row value) and from "closed".
type DialogMode = "closed" | "new" | TypeRow;

export function TypesTable({ types }: { types: TypeRow[] }) {
  const [dialogMode, setDialogMode] = useState<DialogMode>("closed");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogMode("new")}>
          <PlusIcon />
          Add type
        </Button>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={types}
        rowKey={(r) => r.publicId}
        serial={false}
        emptyIcon={PackageIcon}
        emptyMessage="No delivery types yet."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.label}</TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">{r.key}</TableCell>
            <TableCell>
              <RulesCell row={r} />
            </TableCell>
            <TableCell>{r.sortOrder}</TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Retired"}
              </Badge>
            </TableCell>
            <TableCell className="text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label={`Edit ${r.label}`}
                onClick={() => setDialogMode(r)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
            </TableCell>
          </>
        )}
      />

      {dialogMode !== "closed" ? (
        <TypeEditDialog
          key={dialogMode === "new" ? "new" : dialogMode.publicId}
          type={dialogMode === "new" ? null : dialogMode}
          onOpenChange={(open) => !open && setDialogMode("closed")}
        />
      ) : null}
    </div>
  );
}
