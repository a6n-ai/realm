import { HistoryIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { DataTable, type Column } from "@foundry/design-system";
import { TableCell } from "@foundry/ui/table";
import { formatAppWhen } from "@/lib/app-clock";
import type { LedgerListRow } from "@/lib/services/ledger.service";

const COLUMNS: readonly Column<"time" | "customer" | "applied" | "amount">[] = [
  { key: "time", label: "Time" },
  { key: "customer", label: "Customer" },
  { key: "applied", label: "Applied" },
  { key: "amount", label: "Amount", align: "right" },
];

export function DiscountLogs({ rows, timeZone }: { rows: LedgerListRow[]; timeZone: string }) {
  return (
    <DataTable
      pagination="client"
      serial={false}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      emptyIcon={HistoryIcon}
      emptyMessage="No discounts used yet."
      renderRow={(r) => (
        <>
          <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
            {formatAppWhen(r.createdAt, timeZone)}
          </TableCell>
          <TableCell>
            <div className="font-medium">{r.customerName ?? r.customerEmail ?? "Unknown"}</div>
            {r.customerName && r.customerEmail ? <div className="text-muted-foreground text-xs">{r.customerEmail}</div> : null}
          </TableCell>
          <TableCell>{r.memo ?? "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TableCell>
        </>
      )}
    />
  );
}
