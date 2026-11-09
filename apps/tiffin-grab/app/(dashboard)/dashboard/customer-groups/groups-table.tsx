"use client";

import { ACTION_LABEL } from "@/lib/customer-groups/action-labels";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/filters";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { GroupRowActions } from "./group-quick-actions";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";

export type GroupTableRow = {
  publicId: string;
  name: string;
  memberCount: number;
  createdAt: number;
  createdBy: string | null;
  lastAction: { kind: string; createdAt: number } | null;
};

type GroupColumn = "name" | "members" | "last" | "created" | "actions";

const COLUMNS: readonly Column<GroupColumn>[] = [
  { key: "name", label: "Group" },
  { key: "members", label: "Customers", align: "right" },
  { key: "last", label: "Last action" },
  { key: "created", label: "Created" },
  { key: "actions", label: "", align: "right" },
];

export function GroupsTable({ rows, spec, total, page, size }: { rows: GroupTableRow[]; spec: FacetDef[]; total: number; page: number; size: number }) {
  const tz = useTimezone();
  return (
    <>
      <DataTable
        serialOffset={pageOffset(page, size)}
        serial={false}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        filters={<ListSearchFilters spec={spec} dateControl="external" placeholder="Search groups…" shortPlaceholder="Search…" />}
        emptyIcon={UsersIcon}
        emptyMessage="No customer groups yet. Save a set of customers once, then give them coins, email them or offer a coupon."
        emptySearchMessage="No groups match your search."
        emptyAction={
          <Button asChild>
            <Link href="?new=1" scroll={false}><PlusIcon /> New group</Link>
          </Button>
        }
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">
              <Link href={`/dashboard/customer-groups/${r.publicId}`} className="hover:underline">{r.name}</Link>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.memberCount}</TableCell>
            <TableCell className="text-muted-foreground">
              {r.lastAction
                ? `${ACTION_LABEL[r.lastAction.kind] ?? r.lastAction.kind} · ${formatEpoch(r.lastAction.createdAt, { mode: "date", timeZone: tz })}`
                : "None yet"}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
              {formatEpoch(r.createdAt, { mode: "date", timeZone: tz })}
              {r.createdBy ? ` · ${r.createdBy}` : ""}
            </TableCell>
            <TableCell className="text-right">
              <GroupRowActions publicId={r.publicId} name={r.name} />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </>
  );
}

export function GroupsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
