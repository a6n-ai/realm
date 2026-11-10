"use client";

import { RUNNING, inOrderStatuses } from "@/lib/orders/status";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { TableCell } from "@foundry/ui/table";
import type { SortState } from "@foundry/design-system/list-sort";
import type { CustomerRow, CustomerSortColumn } from "@/lib/services/customers.service";
import { CustomerInviteCell } from "./customer-invite-cell";

// Personal details only; money and order facts live on the Payments tab (customer-payments-list.tsx).
// DataTable renders the header and its Skeleton from this array, so the two can never drift.
const COLUMNS: readonly Column<CustomerSortColumn | "invite">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "phone", label: "Phone", sortable: true },
  { key: "invite", label: "Actions", align: "right" },
];

export function CustomersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: CustomerRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CustomerSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={pageOffset(page, size)}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
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
            </TableCell>
            <TableCell>{c.email ?? "(no email)"}</TableCell>
            <TableCell>{c.phone ? formatPhone(c.phone) : "no phone"}</TableCell>
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
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
