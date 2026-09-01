"use client";

import { MailIcon } from "lucide-react";
import { DataTable, ListPagination, type FacetDef } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";

type ActivityRow = {
  at: number;
  recipient: string | null;
  subject: string;
  status: string;
  error: string | null;
  _rowKey: string;
};

// No server-side sort on this union query today — columns are display-only.
type EmailColumn = "time" | "recipient" | "subject" | "status";
const COLUMNS: readonly { key: EmailColumn; label: string }[] = [
  { key: "time", label: "Time" },
  { key: "recipient", label: "Recipient" },
  { key: "subject", label: "Subject / reason" },
  { key: "status", label: "Status" },
];

export function EmailsTable({
  spec,
  rows,
  page,
  size,
  total,
}: {
  spec: FacetDef[];
  rows: ActivityRow[];
  page: number;
  size: number;
  total: number;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r._rowKey}
        serial={false}
        search={{ placeholder: "Search recipient…", shortPlaceholder: "Search…", debounceMs: 250 }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={MailIcon}
        emptyMessage="No emails sent yet."
        emptySearchMessage="No emails match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
              {new Date(Number(r.at)).toLocaleString()}
            </TableCell>
            <TableCell className="text-sm">{r.recipient ?? "—"}</TableCell>
            <TableCell className="text-sm">
              {r.subject}
              {r.error && <span className="text-destructive block text-xs">{r.error}</span>}
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
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
