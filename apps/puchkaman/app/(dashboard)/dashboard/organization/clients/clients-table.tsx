"use client";

import { Building2Icon } from "lucide-react";
import Link from "next/link";
import { TableCell } from "@foundry/ui/table";
import {
  DataTable,
  ListPagination,
  SkeletonFilterBar,
  type Column,
  type FacetDef,
} from "@foundry/design-system";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { UserAvatar } from "@/components/ds";
import type { SortState } from "@/lib/list/sort";
import type { OrganizationListPageRow, OrgSortColumn } from "@/lib/services/organizations.service";
import { CreateFranchiseButton } from "./create-franchise-button";

type OrgCol = OrgSortColumn | "type" | "parent" | "members" | "actions";

const COLUMNS: readonly Column<OrgCol>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "clientCode", label: "Client code", sortable: true },
  { key: "type", label: "Type" },
  { key: "parent", label: "Parent" },
  { key: "members", label: "Members" },
  { key: "actions", label: "", align: "right", width: "w-32" },
];

export function ClientsTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: OrganizationListPageRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<OrgSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search name or client code…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={Building2Icon}
        emptyMessage="No clients yet."
        emptySearchMessage="No clients match your filters."
        renderRow={(row) => (
          <>
            <TableCell className="font-medium">
              <Link href={`/dashboard/organization/clients/${row.id}`} className="flex items-center gap-3 hover:underline">
                <UserAvatar name={row.name} size="sm" />
                {row.name}
              </Link>
            </TableCell>
            <TableCell>{row.clientCode}</TableCell>
            <TableCell>{row.parentOrganizationId === null ? "Brand" : "Franchise"}</TableCell>
            <TableCell>{row.parentName ?? "—"}</TableCell>
            <TableCell>{row.memberCount}</TableCell>
            <TableCell className="text-right">
              {row.parentOrganizationId === null ? <CreateFranchiseButton brandOrganizationId={row.id} /> : null}
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// FilterBar twin + table twin — mirrors live search + ReuiFacetFilters chrome.
export function ClientsTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
