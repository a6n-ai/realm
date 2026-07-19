"use client";

import type { RoleValue } from "@realm/commons";
import { UsersIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import type { SortState } from "@/lib/list/sort";
import { UserRow, UserRowCard } from "./user-row";
import type { UserStatusValue } from "./actions";

type FlagState = { id: string; key: string; label: string; enabled: boolean };

export type UserListRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: RoleValue;
  status: UserStatusValue;
  flags: FlagState[];
};

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<"name" | "email" | "role" | "status" | "flags" | "actions">[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Contact", sortable: true },
  { key: "role", label: "Role", sortable: true },
  { key: "status", label: "Status" },
  { key: "flags", label: "Feature flags" },
  { key: "actions", label: "" },
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
      search={{ placeholder: "Search by name, contact, role or ID…", shortPlaceholder: "Search…", keys: ["name", "email", "phone", "role"] }}
      emptyIcon={UsersIcon}
      emptyMessage="No users yet."
      emptySearchMessage="No users match your search."
      renderRow={(r) => <UserRow {...r} />}
      mobileCard={(r) => <UserRowCard {...r} />}
    />
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function UsersListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
