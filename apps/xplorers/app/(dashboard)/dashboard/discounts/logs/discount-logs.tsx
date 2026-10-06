import { HistoryIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { EmptyState } from "@foundry/design-system";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { formatAppWhen } from "@/lib/app-clock";
import type { LedgerListRow } from "@/lib/services/ledger.service";

export function DiscountLogs({ rows, timeZone }: { rows: LedgerListRow[]; timeZone: string }) {
  if (rows.length === 0) return <EmptyState icon={HistoryIcon} message="No discounts used yet." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Time</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>Applied</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.publicId}>
            <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
              {formatAppWhen(r.createdAt, timeZone)}
            </TableCell>
            <TableCell>
              <div className="font-medium">{r.customerName ?? r.customerEmail ?? "Unknown"}</div>
              {r.customerName && r.customerEmail ? <div className="text-muted-foreground text-xs">{r.customerEmail}</div> : null}
            </TableCell>
            <TableCell>{r.memo ?? "—"}</TableCell>
            <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
