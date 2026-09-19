import { formatMoney } from "@foundry/commons";
import { EmptyState, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { ScrollTextIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { ledgerService } from "@/lib/services/ledger.service";

function formatWhen(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

export default async function PaymentLedgerPage() {
  await requireAdmin();
  const [{ timezone }, rows] = await Promise.all([getAppClock(), ledgerService.listRecent()]);

  return (
    <SectionCard title="Ledger">
      {rows.length === 0 ? (
        <EmptyState icon={ScrollTextIcon} message="No ledger entries yet. Confirmed payments post here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Family</TableHead>
              <TableHead>Memo</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.publicId}>
                <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                  {formatWhen(r.createdAt, timezone)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{r.type}</Badge>
                </TableCell>
                <TableCell className={r.direction === "credit" ? "text-ok" : "text-destructive"}>
                  {r.direction}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.customerName ?? r.customerEmail ?? "Unknown"}</div>
                  {r.customerName && r.customerEmail ? (
                    <div className="text-muted-foreground text-xs">{r.customerEmail}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-56 truncate text-sm">{r.memo ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
