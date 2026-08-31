"use client";

import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import {
  DataTable,
  ListPagination,
  SkeletonFilterBar,
  type Column,
  type FacetDef,
} from "@foundry/design-system";
import { UsersIcon } from "lucide-react";
import type { RoleValue } from "@foundry/commons";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { UserSortColumn, UserStatusValue } from "@/lib/services/users.service";
import { RoleSelect, StatusActions } from "./user-row";

export type UserRow = {
  publicId: string;
  name: string | null;
  email: string | null;
  role: RoleValue;
  status: UserStatusValue;
  orgNames: string | null;
};

type UserCol = UserSortColumn | "client" | "actions";

const COLUMNS: readonly Column<UserCol>[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Email", sortable: true },
  { key: "role", label: "Role", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "client", label: "Client" },
  { key: "actions", label: "", align: "right", width: "w-24" },
];

export function UsersTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  selfPublicId,
}: {
  spec: FacetDef[];
  rows: UserRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<UserSortColumn>;
  selfPublicId?: string;
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
          placeholder: "Search name or email…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={UsersIcon}
        emptyMessage="No accounts yet."
        emptySearchMessage="No accounts match your filters."
        renderRow={(row) => (
          <>
            <TableCell className="font-medium">{row.name ?? "—"}</TableCell>
            <TableCell>{row.email ?? "—"}</TableCell>
            <TableCell>
              <RoleSelect
                publicId={row.publicId}
                role={row.role}
                status={row.status}
                isSelf={row.publicId === selfPublicId}
              />
            </TableCell>
            <TableCell>
              <Badge variant={row.status === "active" ? "default" : "outline"}>
                {row.status === "active"
                  ? "Active"
                  : row.status === "suspended"
                    ? "Suspended"
                    : row.status === "deleted"
                      ? "Removed"
                      : "Inactive"}
              </Badge>
            </TableCell>
            <TableCell>{row.orgNames ?? "—"}</TableCell>
            <TableCell className="text-right">
              <StatusActions
                publicId={row.publicId}
                email={row.email}
                status={row.status}
                isSelf={row.publicId === selfPublicId}
              />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// FilterBar twin + table twin — mirrors live search + ReuiFacetFilters chrome.
export function UsersTableSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
