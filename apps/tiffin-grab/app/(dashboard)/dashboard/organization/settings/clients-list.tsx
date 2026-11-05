"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { DataTable, RowActions, UserAvatar, useListNav, type Column } from "@/components/ds";
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
  { key: "parentName", label: "Type" },
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
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const typeParam = params.get("type");
  const typeFilter = typeParam === "brand" || typeParam === "franchise" ? typeParam : ALL;
  const staffFilter = params.get("staff") === "none" ? "none" : ALL;
  const write = (key: "type" | "staff", value: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value === ALL) sp.delete(key);
    else sp.set(key, value);
    const qs = sp.toString();
    nav(qs ? `${pathname}?${qs}` : pathname);
  };

  // Small dataset (brands + their franchises) — filter client-side rather than
  // round-tripping to the server, same call as the users list. The URL is the
  // filter so a KPI card can land on the same rows.
  const filteredRows = useMemo(
    () =>
      rows.filter((r) => {
        if (typeFilter === "brand" && !r.isBrand) return false;
        if (typeFilter === "franchise" && r.isBrand) return false;
        if (staffFilter === "none" && r.memberCount !== 0) return false;
        return true;
      }),
    [rows, typeFilter, staffFilter],
  );

  return (
    <DataTable
      pagination="client"
      columns={COLUMNS}
      rows={filteredRows}
      rowKey={(r) => r.id}
      sort={sort}
      idAccessor={(r) => r.id}
      idHref={(r) => `/dashboard/organization/settings/${r.id}`}
      search={{ placeholder: "Search clients…", shortPlaceholder: "Search…", keys: ["name", "clientCode"] }}
      filters={
        <>
          <Select value={typeFilter} onValueChange={(v) => write("type", v)}>
            <SelectTrigger size="sm" className="w-32"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All types</SelectItem>
              <SelectItem value="brand">Brand</SelectItem>
              <SelectItem value="franchise">Franchise</SelectItem>
            </SelectContent>
          </Select>
          <Select value={staffFilter} onValueChange={(v) => write("staff", v)}>
            <SelectTrigger size="sm" className="w-32"><SelectValue placeholder="Staff" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Any staff</SelectItem>
              <SelectItem value="none">No staff</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
      emptyIcon={Building2}
      emptyMessage="No clients yet."
      emptySearchMessage="No clients match your search."
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/organization/settings/${r.id}`} className="flex items-center gap-3 hover:underline">
              <UserAvatar name={r.name} size="sm" />
              {r.name}
            </Link>
          </TableCell>
          <TableCell className="font-mono text-sm">{r.clientCode}</TableCell>
          <TableCell>
            {r.isBrand ? (
              <Badge variant="primary-light">Brand</Badge>
            ) : (
              <span className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">Franchise</Badge>
                <span className="text-muted-foreground truncate">of {r.parentName ?? "—"}</span>
              </span>
            )}
          </TableCell>
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
