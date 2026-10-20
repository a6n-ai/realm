import Link from "next/link";
import { TicketPercentIcon } from "lucide-react";
import { DataTable, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import type { AllRow, DiscountStatus } from "./build-rows";

const STATUS_VARIANT: Record<DiscountStatus, "default" | "outline" | "secondary"> = {
  active: "default",
  scheduled: "outline",
  expired: "outline",
  inactive: "secondary",
};

type Key = "name" | "type" | "applies" | "value" | "uses" | "status" | "edit";

const BASE: readonly Column<Key>[] = [
  { key: "name", label: "Name" },
  { key: "type", label: "Type" },
  { key: "applies", label: "Applies to" },
  { key: "value", label: "Value" },
  { key: "uses", label: "Uses", align: "right" },
  { key: "status", label: "Status" },
];

export function AllDiscountsTable({ rows, canEdit }: { rows: AllRow[]; canEdit: boolean }) {
  const columns = canEdit ? [...BASE, { key: "edit" as const, label: "" }] : BASE;
  return (
    <DataTable
      pagination="client"
      serial={false}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.type + r.id}
      emptyIcon={TicketPercentIcon}
      emptyMessage="No discounts yet."
      renderRow={(r) => (
        <>
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
        </>
      )}
    />
  );
}
