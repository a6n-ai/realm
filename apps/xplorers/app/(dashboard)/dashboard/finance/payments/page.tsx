import { formatMoney } from "@foundry/commons";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { CreditCardIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { formatAppWhen } from "@/lib/app-clock";
import { getAppClock } from "@/lib/services/app-settings.service";
import { paymentsService } from "@/lib/services/payments.service";

const STATUS_LABEL: Record<string, string> = {
  awaiting_payment: "Awaiting",
  pending_verification: "Pending",
  paid: "Paid",
  rejected: "Rejected",
  refunded: "Refunded",
};

export default async function FinancePaymentsPage() {
  await requireAdmin();
  const [{ timezone }, rows] = await Promise.all([getAppClock(), paymentsService.listRecent()]);

  return (
    <PageShell>
      <PageHeader icon={CreditCardIcon} title="Payments" subtitle="Booking payments. Configure methods under Settings → Payment." />
      <SectionCard title="All payments">
        {rows.length === 0 ? (
          <EmptyState icon={CreditCardIcon} message="No payments yet. Activate Payments and enable a method to collect booking fees." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Family</TableHead>
                <TableHead>Booking</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.publicId}>
                  <TableCell className="text-muted-foreground whitespace-nowrap text-xs tabular-nums">
                    {formatAppWhen(r.createdAt, timezone)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "paid" ? "default" : r.status === "rejected" ? "destructive" : "outline"}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{r.method}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.customerName ?? r.customerEmail ?? "Unknown"}</div>
                    {r.customerName && r.customerEmail ? (
                      <div className="text-muted-foreground text-xs">{r.customerEmail}</div>
                    ) : null}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.bookingPublicId}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(Number(r.amount), r.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </PageShell>
  );
}
