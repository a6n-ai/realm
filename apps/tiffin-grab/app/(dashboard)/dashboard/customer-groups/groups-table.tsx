"use client";

import Link from "next/link";
import { PlusIcon, UsersIcon } from "lucide-react";
import { DataTable, ListPagination, type Column } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";

export type GroupTableRow = {
  publicId: string;
  name: string;
  memberCount: number;
  createdAt: number;
  createdBy: string | null;
  lastAction: { kind: string; createdAt: number } | null;
};

type GroupColumn = "name" | "members" | "last" | "created";

const COLUMNS: readonly Column<GroupColumn>[] = [
  { key: "name", label: "Group" },
  { key: "members", label: "Customers", align: "right" },
  { key: "last", label: "Last action" },
  { key: "created", label: "Created" },
];

const ACTION_LABEL: Record<string, string> = { coins: "Coins given", email: "Emailed", discount: "Coupon applied" };

export function GroupsTable({ rows, total, page, size }: { rows: GroupTableRow[]; total: number; page: number; size: number }) {
  const tz = useTimezone();
  return (
    <>
      <DataTable
        serialOffset={page * size}
        serial={false}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        emptyIcon={UsersIcon}
        emptyMessage="No customer groups yet. Save a set of customers once, then give them coins, email them or offer a coupon."
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
