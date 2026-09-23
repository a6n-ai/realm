"use client";

import { UsersIcon } from "lucide-react";
import { DataTable, ListPagination, SkeletonFilterBar, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import { UserRow, UserRowCard } from "./user-row";
import type { UserStatusValue } from "./actions";
import type { RoleValue } from "@foundry/commons";

export type UserListRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: RoleValue;
  status: UserStatusValue;
  passwordSet: boolean;
  invitationStatus: "none" | "pending" | "expired" | "accepted";
};

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift. Feature flags live on the user detail page, not here —
// keeps this row lean as the flag set grows.
const COLUMNS: readonly Column<"name" | "email" | "role" | "status" | "actions">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Contact", sortable: true },
  { key: "role", label: "Role", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "actions", label: "" },
];

export function UsersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: UserListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<"name" | "email" | "role" | "status">;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        sort={sort}
        idAccessor={(r) => r.id}
        search={{ placeholder: "Search users…", shortPlaceholder: "Search…", debounceMs: 250 }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={UsersIcon}
        emptyMessage="No users yet."
        emptySearchMessage="No users match your filters."
        renderRow={(r) => <UserRow {...r} />}
        mobileCard={(r) => <UserRowCard {...r} />}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// FilterBar twin + table twin — mirrors live search + ReuiFacetFilters chrome.
export function UsersListSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} hasId />
    </div>
  );
}
