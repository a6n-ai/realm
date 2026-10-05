import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { EmptyState } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import type { AllRow, DiscountStatus } from "./build-rows";

const STATUS_VARIANT: Record<DiscountStatus, "default" | "outline" | "secondary"> = {
  active: "default",
  scheduled: "outline",
  expired: "outline",
  inactive: "secondary",
};

export function AllDiscountsTable({ rows, canEdit }: { rows: AllRow[]; canEdit: boolean }) {
  if (rows.length === 0) return <EmptyState icon={TicketPercentIcon} message="No discounts yet." />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Applies to</TableHead>
          <TableHead>Value</TableHead>
          <TableHead className="text-right">Uses</TableHead>
          <TableHead>Status</TableHead>
          {canEdit ? <TableHead className="sr-only">Edit</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.type + r.id}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>
              <Badge variant="outline">{r.type === "coupon" ? "Coupon" : "Discount"}</Badge>
            </TableCell>
            <TableCell>{r.appliesTo}</TableCell>
            <TableCell className="tabular-nums">{r.value}</TableCell>
            <TableCell className="text-right tabular-nums">{r.uses ?? "—"}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status]} className="capitalize">
                {r.status}
              </Badge>
            </TableCell>
            {canEdit ? (
              <TableCell className="text-right">
                <Link href={r.href} className="text-sm underline-offset-4 hover:underline">
                  Edit
                </Link>
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
