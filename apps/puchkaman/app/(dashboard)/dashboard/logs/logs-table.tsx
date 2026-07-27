"use client";

import { ScrollTextIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  type Column,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { AuditListRow, AuditSortColumn } from "@/lib/services/audit.service";

const COLUMNS: readonly Column<AuditSortColumn>[] = [
  { key: "time", label: "When", sortable: true },
  { key: "actor", label: "Actor", sortable: true },
  { key: "operation", label: "Action", sortable: true },
  { key: "entity", label: "Entity", sortable: true },
];

function operationVariant(
  operation: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (operation) {
    case "create":
    case "login":
      return "default";
    case "update":
      return "secondary";
    case "delete":
    case "login_failed":
      return "destructive";
    case "read":
    case "logout":
      return "outline";
    default:
      return "outline";
  }
}

export function LogsTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: AuditListRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<AuditSortColumn>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        serial={false}
        sort={sort}
        search={{
          placeholder: "Search entity id or actor…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={ScrollTextIcon}
        emptyMessage="No activity logged yet."
        emptySearchMessage="No logs match your filters."
        renderRow={(r) => (
          <>
            <TableCell className="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
              {new Date(r.createdAt).toLocaleString()}
            </TableCell>
            <TableCell>
              <div className="font-medium">{r.actorName?.trim() || r.actorEmail || "System"}</div>
              {r.actorEmail ? (
                <div className="text-muted-foreground text-xs">{r.actorEmail}</div>
              ) : null}
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{r.actionLabel}</span>
                <Badge variant={operationVariant(r.operation)} className="w-fit capitalize">
                  {r.operation.replaceAll("_", " ")}
                </Badge>
              </div>
            </TableCell>
            <TableCell>
              <div className="capitalize">{r.entity.replaceAll("_", " ")}</div>
              <div className="text-muted-foreground font-mono text-[10px]">{r.entityPublicId}</div>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function LogsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
