import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { EmptyState } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { formatAppWhen } from "@/lib/app-clock";
import type { CouponRow } from "@/lib/services/discounts.service";
import { discountStatus, valueLabel } from "../../catalog/discounts/build-rows";

export function CouponsManager({
  coupons,
  canEdit,
  timeZone,
  now,
}: {
  coupons: CouponRow[];
  canEdit: boolean;
  timeZone: string;
  now: number;
}) {
  if (coupons.length === 0) return <EmptyState icon={TicketPercentIcon} message="No coupons yet." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Value</TableHead>
          <TableHead className="text-right">Uses</TableHead>
          <TableHead>Expires</TableHead>
          <TableHead>Status</TableHead>
          {canEdit ? <TableHead className="sr-only">Edit</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {coupons.map((c) => {
          const status = discountStatus({ active: c.active, startsAt: c.startsAt, endsAt: c.expiresAt }, now);
          return (
            <TableRow key={c.publicId}>
              <TableCell className="font-mono text-xs">{c.code}</TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell className="tabular-nums">{valueLabel(c.percentOff, c.amountOff)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {c.maxRedemptions != null ? `${c.redemptionCount} / ${c.maxRedemptions}` : c.redemptionCount}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {c.expiresAt != null ? formatAppWhen(c.expiresAt, timeZone) : "Never"}
              </TableCell>
              <TableCell>
                <Badge variant={status === "active" ? "default" : status === "inactive" ? "secondary" : "outline"} className="capitalize">
                  {status}
                </Badge>
              </TableCell>
              {canEdit ? (
                <TableCell className="text-right">
                  <Link href={`/dashboard/discounts/coupons/${c.publicId}`} className="text-sm underline-offset-4 hover:underline">
                    Edit
                  </Link>
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
