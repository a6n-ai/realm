"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InboxIcon, PencilIcon, PlusIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { DataTable } from "@/components/ds";
import { DiscountDialog, type DiscountDialogOptions } from "@/components/dashboard/discount-dialog";
import { COUPONS_HREF, MEAL_SIZES_HREF, TYPE_LABELS, type AllRow, type DiscountDto, type DiscountKind, type RowType } from "./build-rows";

export const ALL_DISCOUNT_COLUMNS = [
  { key: "type", label: "Type" },
  { key: "appliesTo", label: "Applies to" },
  { key: "value", label: "Value", align: "right" as const },
  { key: "status", label: "Status" },
  { key: "manage", label: "Where it lives", align: "right" as const, width: "w-px" },
];

const STATUS_LABEL = { active: "Active", inactive: "Inactive", scheduled: "Scheduled", expired: "Expired" } as const;

export function AllDiscountsTable({ rows, options, moreCoupons }: { rows: AllRow[]; options: DiscountDialogOptions; moreCoupons: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<RowType | "all">("all");
  const [dialog, setDialog] = useState<{ discount?: DiscountDto; kind: DiscountKind } | null>(null);
  const shown = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  return (
    <div className="space-y-3">
      <DataTable
        columns={ALL_DISCOUNT_COLUMNS}
        rows={shown}
        rowKey={(r) => `${r.type}:${r.id}`}
        serial={false}
        filters={
          <div className="flex flex-wrap gap-1.5">
            {(["all", "delivery", "duration", "list_price", "coupon"] as const).map((t) => (
              <Button key={t} size="sm" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
                {t === "all" ? "All" : TYPE_LABELS[t]}
              </Button>
            ))}
          </div>
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button><PlusIcon className="size-4" /> Add discount</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog({ kind: "delivery" })}>Delivery type</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog({ kind: "duration" })}>Plan length</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(MEAL_SIZES_HREF)}>List price (meal sizes)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(COUPONS_HREF)}>Coupon</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
        emptyIcon={InboxIcon}
        emptyMessage="No discounts yet."
        renderRow={(r) => (
          <>
            <TableCell><Badge variant="secondary" className="font-normal">{r.typeLabel}</Badge></TableCell>
            <TableCell className="font-medium">{r.appliesTo}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value}</TableCell>
            <TableCell>
              <Badge variant={r.status === "active" ? "default" : "outline"} className="font-normal">{STATUS_LABEL[r.status]}</Badge>
            </TableCell>
            <TableCell className="text-right">
              {r.discount ? (
                <Button size="sm" variant="ghost" onClick={() => setDialog({ discount: r.discount!, kind: r.discount!.kind })}>
                  <PencilIcon className="size-3.5" /> Manage
                </Button>
              ) : (
                <Button size="sm" variant="ghost" asChild>
                  <Link href={r.href!}><ExternalLinkIcon className="size-3.5" /> Manage</Link>
                </Button>
              )}
            </TableCell>
          </>
        )}
      />
      {moreCoupons ? (
        <p className="text-muted-foreground text-sm">Showing the first coupons only. <Link href={COUPONS_HREF} className="text-primary hover:underline">View all coupons</Link></p>
      ) : null}
      <DiscountDialog
        open={dialog != null}
        onOpenChange={(o) => !o && setDialog(null)}
        discount={dialog?.discount}
        prefill={dialog ? { kind: dialog.kind } : undefined}
        options={options}
      />
    </div>
  );
}

export function AllDiscountsSkeleton() {
  return <DataTable.Skeleton columns={ALL_DISCOUNT_COLUMNS} />;
}
