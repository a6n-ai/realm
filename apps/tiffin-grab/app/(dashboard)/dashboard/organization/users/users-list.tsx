"use client";

import { useMemo, useState } from "react";
import { Role, type RoleValue } from "@foundry/commons";
import { UsersIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { DataTable, type Column } from "@/components/ds";
import type { SortState } from "@/lib/list/sort";
import { UserRow, UserRowCard } from "./user-row";
import type { UserStatusValue } from "./actions";

const ALL = "all";
const USER_STATUSES: UserStatusValue[] = ["active", "inactive", "suspended", "deleted"];

export type UserListRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: RoleValue;
  status: UserStatusValue;
  passwordSet: boolean;
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
  rows,
  sort,
}: {
  rows: UserListRow[];
  sort: SortState<"name" | "email" | "role" | "status">;
}) {
  const [roleFilter, setRoleFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);

  // Client-side: the org's staff/user list is small enough that fetching once
  // and filtering in the browser beats round-tripping to the server per filter.
  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) => (roleFilter === ALL || r.role === roleFilter) && (statusFilter === ALL || r.status === statusFilter),
      ),
    [rows, roleFilter, statusFilter],
  );

  return (
    <DataTable
      columns={COLUMNS}
      rows={filteredRows}
      rowKey={(r) => r.id}
      sort={sort}
      idAccessor={(r) => r.id}
      search={{ placeholder: "Search users…", shortPlaceholder: "Search…", keys: ["name", "email", "phone", "role"] }}
      filters={
        <>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All roles</SelectItem>
              {Object.values(Role).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {USER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      }
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
