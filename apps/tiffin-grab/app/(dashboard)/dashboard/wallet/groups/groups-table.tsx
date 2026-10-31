"use client";

import { UsersIcon } from "lucide-react";
import Link from "next/link";
import { DataTable, ListPagination, RowActions, type Column } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { CreateGrantEmailButton } from "./grant-group-actions";

export type GroupRow = {
  publicId: string;
  name: string;
  when: string;
  givenBy: string | null;
  memberCount: number;
  awardedCount: number;
  cappedCount: number;
  coins: number;
};

const COLUMNS: readonly Column<"name" | "when" | "givenBy" | "members" | "awarded" | "blocked" | "coins" | "actions">[] = [
  { key: "name", label: "Name" },
  { key: "when", label: "Date" },
  { key: "givenBy", label: "Given by" },
  { key: "members", label: "Members", align: "right" },
  { key: "awarded", label: "Awarded", align: "right" },
  { key: "blocked", label: "Blocked", align: "right" },
  { key: "coins", label: "Coins each", align: "right" },
  { key: "actions", label: "Actions", align: "right", width: "w-32" },
];

export function GroupsTable({ rows, total, page, size }: { rows: GroupRow[]; total: number; page: number; size: number }) {
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        serial={false}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/wallet/groups/${r.publicId}`}
        emptyIcon={UsersIcon}
        emptyMessage="No groups yet"
        emptyAction={
          <Button asChild size="sm">
            <Link href="/dashboard/wallet/give">Give coins</Link>
          </Button>
        }
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell className="text-muted-foreground tabular-nums">{r.when}</TableCell>
            <TableCell className="text-muted-foreground">{r.givenBy ?? "Not recorded"}</TableCell>
            <TableCell className="text-right tabular-nums">{r.memberCount}</TableCell>
            <TableCell className="text-right tabular-nums">{r.awardedCount}</TableCell>
            <TableCell className="text-right tabular-nums">{r.cappedCount}</TableCell>
            <TableCell className="text-right tabular-nums">{r.coins}</TableCell>
            <TableCell>
              <RowActions>
                <CreateGrantEmailButton groupId={r.publicId} size="sm" />
              </RowActions>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function GroupsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
