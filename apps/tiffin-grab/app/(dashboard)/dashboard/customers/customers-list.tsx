"use client";

import { RUNNING, inOrderStatuses } from "@/lib/orders/status";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { formatMoney, formatPhone } from "@foundry/commons";
import { Badge } from "@/components/reui/badge";
import { cn } from "@foundry/ui/cn";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@foundry/ui/table";
import type { SortState } from "@foundry/design-system/list-sort";
import type { CustomerRow, CustomerSortColumn } from "@/lib/services/customers.service";
import { CustomerInviteCell } from "./customer-invite-cell";

// Name, email and phone share one column so order facts fit without sideways scroll.
// DataTable renders the header and its Skeleton from this array, so the two can never drift.
type Key = CustomerSortColumn | "status" | "orders" | "invite";
const NAME: Column<Key> = { key: "name", label: "Customer", sortable: true, width: "w-72" };
const STATUS: Column<Key> = { key: "status", label: "Status", width: "w-28" };
const ORDERS: Column<Key> = { key: "orders", label: "Orders", align: "right", width: "w-20" };
const LAST: Column<Key> = { key: "latestOrder", label: "Last order", sortable: true, align: "right", width: "w-28" };
const PAID: Column<Key> = { key: "paid", label: "Total paid", sortable: true, align: "right", width: "w-28" };
const ACTIONS: Column<Key> = { key: "invite", label: "Actions", align: "right", width: "w-32" };
const columnsFor = (canFinance: boolean): readonly Column<Key>[] =>
  canFinance ? [NAME, STATUS, ORDERS, LAST, PAID, ACTIONS] : [NAME, STATUS, ORDERS, LAST, ACTIONS];

function statusOf(latest: string | null): { label: string; variant: "success-light" | "secondary" | "outline" } {
  if (latest == null) return { label: "No orders", variant: "outline" };
  return inOrderStatuses(RUNNING, latest) ? { label: "Active plan", variant: "success-light" } : { label: "Ended", variant: "secondary" };
}

export function CustomersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  canFinance = false,
}: {
  spec: FacetDef[];
  rows: CustomerRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CustomerSortColumn>;
  /** Total paid is finance data: the column shows only for finance:read. */
  canFinance?: boolean;
}) {
  const tz = useTimezone();
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={pageOffset(page, size)}
        columns={columnsFor(canFinance)}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idHref={(r) => `/dashboard/customers/${r.publicId}`}
        rowClassName={() => "group cursor-pointer"}
        filters={<ListSearchFilters spec={spec} placeholder="Search customers…" shortPlaceholder="Search…" dateControl="external" />}
        emptyIcon={UsersIcon}
        emptyMessage="No customers yet."
        emptySearchMessage="No customers match your search."
        renderRow={(c) => (
          <>
            <TableCell className="font-medium">
              <Link href={`/dashboard/customers/${c.publicId}`} className="group-hover:underline">
                {c.name ?? "(no name)"}
              </Link>
              <p className="text-muted-foreground truncate text-xs font-normal">
                {c.email ?? "(no email)"} · {c.phone ? formatPhone(c.phone) : "no phone"}
              </p>
            </TableCell>
            <TableCell>
              <Badge variant={statusOf(c.latestStatus).variant}>{statusOf(c.latestStatus).label}</Badge>
              {/* Joined = they've used the account (verified email); until then the invite actions show. */}
              <p className={cn("mt-1 text-xs", c.joined ? "text-muted-foreground" : "text-warning")}>{c.joined ? "Joined" : "Not joined"}</p>
            </TableCell>
            <TableCell className="text-right tabular-nums">{c.orderCount}</TableCell>
            <TableCell className="text-right tabular-nums">
              {c.latestOrderAt == null ? "—" : formatEpoch(c.latestOrderAt, { mode: "date", timeZone: tz })}
            </TableCell>
            {canFinance ? <TableCell className="text-right tabular-nums">{formatMoney(Number(c.totalPaid ?? 0))}</TableCell> : null}
            <TableCell>
              <CustomerInviteCell
                publicId={c.publicId}
                email={c.email}
                joined={c.joined}
                hasActivePlan={inOrderStatuses(RUNNING, c.latestStatus)}
                lastInvite={c.lastInvite}
                lastReminder={c.lastReminder}
              />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CustomersListSkeleton() {
  return <DataTable.Skeleton columns={columnsFor(false)} />;
}
