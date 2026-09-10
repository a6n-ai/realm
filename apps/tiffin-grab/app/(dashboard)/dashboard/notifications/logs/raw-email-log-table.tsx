import { MailIcon } from "lucide-react";
import { DataTable, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";

export type EmailRow = { at: number; recipient: string | null; subject: string; status: string; error: string | null };

const COLUMNS: readonly Column<"time" | "recipient" | "subject" | "status">[] = [
  { key: "time", label: "Time" },
  { key: "recipient", label: "Recipient" },
  { key: "subject", label: "Subject / reason" },
  { key: "status", label: "Status" },
];

// Raw SES-level sends + suppressions — distinct from the event-driven
// notificationOutbox above. Fixed to the most recent rows (no search/sort/
// pagination props here — those DataTables key off the shared `q`/`page` URL
// params, and two interactive tables on one route would fight over them).
export function RawEmailLogTable({ rows, timeZone }: { rows: EmailRow[]; timeZone: string }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => `${r.recipient}-${r.at}-${r.subject}`}
      serial={false}
      emptyIcon={MailIcon}
      emptyMessage="No emails yet."
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
  );
}

export function RawEmailLogTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
