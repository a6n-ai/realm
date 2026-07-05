"use client";

import type { RoleValue } from "@realm/commons";
import { UsersIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import type { SortState } from "@/lib/list/sort";
import { UserRow, UserRowCard } from "./user-row";

type FlagState = { id: string; key: string; label: string; enabled: boolean };

export type UserListRow = {
  id: string;
  email: string | null;
  phone: string | null;
  role: RoleValue;
  flags: FlagState[];
};

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<"email" | "role" | "flags">[] = [
  { key: "email", label: "Contact", sortable: true },
  { key: "role", label: "Role", sortable: true },
  { key: "flags", label: "Feature flags" },
];

export function UsersList({
  rows,
  sort,
}: {
  rows: UserListRow[];
  sort: SortState<"email" | "role">;
}) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      sort={sort}
      idAccessor={(r) => r.id}
      search={{ placeholder: "Search by contact, role or ID…", keys: ["email", "phone", "role"] }}
      emptyIcon={UsersIcon}
      emptyMessage="No users yet."
      emptySearchMessage="No users match your search."
      renderRow={(r) => <UserRow {...r} />}
      mobileCard={(r) => <UserRowCard {...r} />}
    />
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
UsersList.Skeleton = function UsersListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
};
