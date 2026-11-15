"use client";

import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { UsersIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { DataTable, ListPagination, SkeletonFilterBar, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@foundry/design-system/list-sort";
import { UserRow, UserRowCard, type RoleCtx } from "./user-row";
import type { UserStatusValue } from "./actions";
import type { RoleValue } from "@foundry/commons";

export type UserListRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: RoleValue;
  memberId: string;
  orgRole: string;
  status: UserStatusValue;
  passwordSet: boolean;
  invitationStatus: "none" | "pending" | "expired" | "accepted";
  organizationId: string;
};

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<"name" | "email" | "role" | "status" | "actions">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "email", label: "Contact", sortable: true },
  { key: "role", label: "Roles", sortable: true },
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
  roleCtx,
}: {
  spec: FacetDef[];
  rows: UserListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<"name" | "email" | "role" | "status">;
  roleCtx: RoleCtx;
}) {
  const params = useSearchParams();
  // Opens the member panel and keeps the search and filters in the URL.
  const hrefFor = (memberId: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("member", memberId);
    return `?${sp.toString()}`;
  };
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={pageOffset(page, size)}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        sort={sort}
        idAccessor={(r) => r.id}
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

// FilterBar twin + table twin — mirrors live search + ReuiFacetFilters chrome.
export function UsersListSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonFilterBar dropdown />
      <DataTable.Skeleton columns={COLUMNS} hasId />
    </div>
  );
}
