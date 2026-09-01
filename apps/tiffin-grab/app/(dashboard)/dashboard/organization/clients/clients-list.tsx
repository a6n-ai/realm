"use client";

import { useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { DataTable, RowActions, UserAvatar, type Column } from "@/components/ds";
import type { SortState } from "@/lib/list/sort";
import { CreateFranchiseButton } from "./create-franchise-button";

const ALL = "all";

export type ClientListRow = {
  id: string;
  name: string;
  clientCode: string;
  parentName: string | null;
  memberCount: number;
  isBrand: boolean;
};

const COLUMNS: readonly Column<"name" | "clientCode" | "parentName" | "memberCount" | "actions">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "clientCode", label: "Client code", sortable: true },
  { key: "parentName", label: "Brand" },
  { key: "memberCount", label: "Members", sortable: true, align: "right" },
  { key: "actions", label: "" },
];

export function ClientsList({
  rows,
  sort,
}: {
  rows: ClientListRow[];
  sort: SortState<"name" | "clientCode" | "memberCount">;
}) {
  const [typeFilter, setTypeFilter] = useState<string>(ALL);

  // Small dataset (brands + their franchises) — filter client-side rather than
  // round-tripping to the server, same call as the users list.
  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (typeFilter === "brand") return r.isBrand;
        if (typeFilter === "franchise") return !r.isBrand;
        return true;
      }),
    [rows, typeFilter],
  );

  return (
    <DataTable
      columns={COLUMNS}
      rows={filteredRows}
      rowKey={(r) => r.id}
      sort={sort}
      idAccessor={(r) => r.id}
      idHref={(r) => `/dashboard/organization/clients/${r.id}`}
      rowClassName={() => "group cursor-pointer"}
      search={{ placeholder: "Search clients…", shortPlaceholder: "Search…", keys: ["name", "clientCode"] }}
      filters={
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            <SelectItem value="brand">Brand</SelectItem>
            <SelectItem value="franchise">Franchise</SelectItem>
          </SelectContent>
        </Select>
      }
      emptyIcon={Building2}
      emptyMessage="No clients yet."
      emptySearchMessage="No clients match your search."
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            <span className="group-hover:underline flex items-center gap-3">
              <UserAvatar name={r.name} size="sm" />
              {r.name}
            </span>
          </TableCell>
          <TableCell className="font-mono text-sm">{r.clientCode}</TableCell>
          <TableCell className="text-muted-foreground">{r.parentName ?? "—"}</TableCell>
          <TableCell className="text-right tabular-nums">{r.memberCount}</TableCell>
          <TableCell>
            {r.isBrand && (
              <RowActions>
                <CreateFranchiseButton brandOrganizationId={r.id} variant="icon" />
              </RowActions>
            )}
          </TableCell>
        </>
      )}
    />
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function ClientsListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
