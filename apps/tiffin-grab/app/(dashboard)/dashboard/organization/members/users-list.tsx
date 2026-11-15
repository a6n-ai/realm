"use client";

import { UsersIcon } from "lucide-react";
import { DataTable, ListPagination, SkeletonFilterBar, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@foundry/design-system/list-sort";
import { UserRow, UserRowCard, type RoleCtx } from "./user-row";
import type { PeopleRow } from "./people-rows";

export type UserListRow = PeopleRow;

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<"name" | "role" | "access" | "status" | "joined" | "actions">[] = [
  { key: "name", label: "Member", sortable: true },
  { key: "role", label: "Roles", sortable: true, width: "w-56" },
  { key: "access", label: "Access" },
  { key: "status", label: "Status", sortable: true, width: "w-44" },
  { key: "joined", label: "Joined" },
  { key: "actions", label: "" },
];

export function UsersList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  roleCtx,
}: {
  spec: FacetDef[];
  rows: UserListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<"name" | "role" | "status">;
  roleCtx: RoleCtx;
}) {
  const hrefFor = (memberId: string) => `/dashboard/organization/people/${memberId}`;
  return (
    <div className="space-y-4">
      <DataTable
        serial={false}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        sort={sort}
        idHref={(r) => hrefFor(r.memberId)}
        search={{ placeholder: "Search users…", shortPlaceholder: "Search…", debounceMs: 250 }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={UsersIcon}
        emptyMessage="No users yet."
        emptySearchMessage="No users match your filters."
        renderRow={(r) => <UserRow {...r} ctx={roleCtx} href={hrefFor(r.memberId)} />}
        mobileCard={(r) => <UserRowCard {...r} ctx={roleCtx} href={hrefFor(r.memberId)} />}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// FilterBar twin + table twin: mirrors live search + ReuiFacetFilters chrome.
export function UsersListSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} serial={false} />
    </div>
  );
}
