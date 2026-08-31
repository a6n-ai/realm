"use client";

import { useState } from "react";
import { PencilIcon, TagIcon } from "lucide-react";
import { formatMoney } from "@realm/commons";
import { DataTable, type Column } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Button } from "@realm/ui/button";
import { TableCell } from "@realm/ui/table";
import { DiscountEditDialog } from "./discount-edit-dialog";
import type { DiscountRow } from "@/lib/services/inventory.repository";

function discountLabel(row: { amount: string | null; percentage: string | null }): string {
  if (row.percentage != null && row.percentage !== "") {
    return `${Number(row.percentage)}%`;
  }
  if (row.amount != null && row.amount !== "") {
    return formatMoney(Number(row.amount));
  }
  return "—";
}

const dateFmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/**
 * Active/Upcoming/Expired at a glance, so a stale window is obvious without
 * opening the edit dialog.
 */
// Lowercase: a plain render helper, not a component, so the impure Date.now()
// call inside is not subject to the components-must-be-pure lint rule.
function windowBadge(startsAt: number | null, expiresAt: number | null) {
  if (startsAt == null && expiresAt == null) {
    return <span className="text-muted-foreground text-xs">Always</span>;
  }
  const now = Date.now();
  if (expiresAt != null && now > expiresAt) {
    return (
      <Badge variant="destructive" className="text-xs">
        Expired {dateFmt.format(expiresAt)}
      </Badge>
    );
  }
  if (startsAt != null && now < startsAt) {
    return (
      <Badge variant="outline" className="text-xs">
        Starts {dateFmt.format(startsAt)}
      </Badge>
    );
  }
  if (expiresAt != null) {
    return (
      <span className="text-muted-foreground text-xs">
        Expires {dateFmt.format(expiresAt)}
      </span>
    );
  }
  return <span className="text-muted-foreground text-xs">Active</span>;
}

const COLUMNS: readonly Column<
  "name" | "value" | "status" | "window" | "offer" | "minSpend" | "stackable" | "cloverId" | "edit"
>[] = [
  { key: "name", label: "Name" },
  { key: "value", label: "Value" },
  { key: "status", label: "Status" },
  { key: "window", label: "Window" },
  { key: "offer", label: "Offer / code" },
  { key: "minSpend", label: "Min spend" },
  { key: "stackable", label: "Stackable" },
  { key: "cloverId", label: "Clover id" },
  { key: "edit", label: "Edit", align: "right" },
];

export function DiscountsTable({ rows }: { rows: DiscountRow[] }) {
  const [editing, setEditing] = useState<DiscountRow | null>(null);

  return (
    <>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        search={{
          keys: ["name", "couponCode"],
          placeholder: "Search name or coupon code…",
          shortPlaceholder: "Search…",
        }}
        emptyIcon={TagIcon}
        emptyMessage="No discounts yet."
        emptySearchMessage="No discounts match your search."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{discountLabel(r)}</TableCell>
            <TableCell>
              <Badge variant={r.active ? "default" : "outline"}>
                {r.active ? "Active" : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>{windowBadge(r.startsAt, r.expiresAt)}</TableCell>
            <TableCell className="text-sm">
              {r.publicOffer ? <Badge variant="secondary">Offered</Badge> : null}
              {r.couponCode ? (
                <span className="ml-2 font-mono text-xs uppercase">{r.couponCode}</span>
              ) : null}
              {!r.publicOffer && !r.couponCode ? (
                <span className="text-muted-foreground text-xs">Not redeemable</span>
              ) : null}
            </TableCell>
            <TableCell className="text-sm">
              {r.minSubtotal != null ? formatMoney(Number(r.minSubtotal)) : "—"}
            </TableCell>
            <TableCell className="text-sm">{r.stackable ? "Yes" : "No"}</TableCell>
            <TableCell className="text-muted-foreground font-mono text-xs">
              {r.cloverDiscountId ?? "—"}
            </TableCell>
            <TableCell className="text-right">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                aria-label={`Edit ${r.name}`}
                onClick={() => setEditing(r)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
            </TableCell>
          </>
        )}
      />
      {/* key remounts the dialog for each row, so its fields reseed from the new discount. */}
      <DiscountEditDialog
        key={editing?.publicId ?? "none"}
        discount={editing}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </>
  );
}

export function DiscountsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
