"use client";

import { MailIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { formatEpoch } from "@/lib/format/datetime";

export type EmailRow = { at: number; recipient: string | null; subject: string; status: string; error: string | null };

const COLUMNS: readonly Column<"time" | "recipient" | "subject" | "status">[] = [
  { key: "time", label: "Time" },
  { key: "recipient", label: "Recipient" },
  { key: "subject", label: "Subject / reason" },
  { key: "status", label: "Status" },
];

export function EmailsTable({
  spec,
  rows,
  total,
  page,
  size,
  timeZone,
}: {
  spec: FacetDef[];
  rows: EmailRow[];
  total: number;
  page: number;
  size: number;
  timeZone: string;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => `${r.recipient}-${r.at}-${r.subject}`}
        search={{ placeholder: "Search emails…", shortPlaceholder: "Search…", debounceMs: 300 }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={MailIcon}
        emptyMessage="No emails yet."
        emptySearchMessage="No emails match."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
              {formatEpoch(r.at, { mode: "datetime", timeZone })}
            </TableCell>
            <TableCell className="text-sm">{r.recipient ?? "—"}</TableCell>
            <TableCell className="text-sm">
              {r.subject}
              {r.error && <span className="block text-xs text-destructive">{r.error}</span>}
            </TableCell>
            <TableCell>
              <Badge variant={r.status === "sent" ? "secondary" : "outline"}>{r.status}</Badge>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function EmailsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
