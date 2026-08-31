"use client";

import { ContactIcon } from "lucide-react";
import { formatPhone } from "@realm/commons";
import { DataTable, ListPagination, type Column, type FacetDef } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { InviteCustomerButton } from "@/components/admin/invite-customer-button";
import type { SortState } from "@/lib/list/sort";
import type { CloverCustomerListRow, CloverCustomerSortColumn } from "@/lib/services/clover-customers.service";

const COLUMNS: readonly Column<CloverCustomerSortColumn>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "customerSince", label: "Customer since", sortable: true, align: "right" },
  { key: "actions", label: "" },
];

export function CloverCustomersTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  showClient,
}: {
  spec: FacetDef[];
  rows: CloverCustomerListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CloverCustomerSortColumn>;
  showClient: boolean;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search name, email or phone…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={ContactIcon}
        emptyMessage="No customers yet. Connect Clover and run Sync from Clover."
        emptySearchMessage="No customers match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">
              {r.name}
              {showClient && r.clientCode && (
                <span className="text-muted-foreground ml-2 font-mono text-xs">{r.clientCode}</span>
              )}
            </TableCell>
            <TableCell>
              <div className="text-xs">{r.email ?? "—"}</div>
              <div className="text-muted-foreground text-xs">{r.phone ? formatPhone(r.phone) : "—"}</div>
            </TableCell>
            <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
              {r.customerSince ? new Date(r.customerSince).toLocaleDateString() : "—"}
            </TableCell>
            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-end gap-2">
                <Badge variant={r.marketingAllowed ? "default" : "outline"}>
                  {r.marketingAllowed ? "Opted in" : "Opted out"}
                </Badge>
                <Badge variant={r.hasAccount ? "default" : "outline"}>
                  {r.hasAccount ? "Has account" : "No account"}
                </Badge>
                <span className="text-muted-foreground font-mono text-xs">{r.cloverCustomerId ?? "—"}</span>
                {!r.hasAccount && r.email && <InviteCustomerButton publicId={r.publicId} />}
              </div>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CloverCustomersTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
