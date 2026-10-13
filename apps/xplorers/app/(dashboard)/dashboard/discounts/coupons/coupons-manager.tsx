import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { DataTable, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { formatAppWhen } from "@/lib/app-clock";
import type { CouponRow } from "@/lib/services/discounts.service";
import { discountStatus, valueLabel } from "../../catalog/discounts/build-rows";

type Key = "code" | "name" | "value" | "uses" | "expires" | "status" | "edit";

const BASE: readonly Column<Key>[] = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "value", label: "Value" },
  { key: "uses", label: "Uses", align: "right" },
  { key: "expires", label: "Expires" },
  { key: "status", label: "Status" },
];

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
  const columns = canEdit ? [...BASE, { key: "edit" as const, label: "" }] : BASE;
  return (
    <DataTable
      pagination="client"
      serial={false}
      columns={columns}
      rows={coupons}
      rowKey={(c) => c.publicId}
      emptyIcon={TicketPercentIcon}
      emptyMessage="No coupons yet."
      renderRow={(c) => {
        const status = discountStatus({ active: c.active, startsAt: c.startsAt, endsAt: c.expiresAt }, now);
        return (
          <>
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
          </>
        );
      }}
    />
  );
}
