"use client";

import { CalendarDaysIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import {
  DataTable,
  FacetFilters,
  ListPagination,
  type Column,
  type FacetDef,
} from "@foundry/design-system";
import type { SortState } from "@/lib/list/sort";
import { CATEGORY_LABELS } from "@/lib/sessions/format";
import type { SessionCategory } from "@/db/schema/studio";
import type { SessionSortColumn } from "@/lib/services/studio-sessions.service";
import { SessionRowActions } from "./session-row-actions";

export type SessionListRow = {
  publicId: string;
  classPublicId: string;
  title: string;
  category: SessionCategory;
  occursOn: string;
  timeLabel: string;
  remaining: number;
  capacity: number;
  published: boolean;
};

type Col = SessionSortColumn | "remaining" | "actions";

const COLUMNS: readonly Column<Col>[] = [
  { key: "title", label: "Class", sortable: true },
  { key: "occursOn", label: "Date", sortable: true },
  { key: "category", label: "Category", sortable: true },
  { key: "published", label: "Status", sortable: true },
  { key: "remaining", label: "Seats", align: "right" },
  { key: "actions", label: "Actions", align: "right", width: "w-24" },
];

const NESTED_COLUMNS: readonly Column<Col>[] = COLUMNS.filter((column) => column.key !== "title");

export function SessionsTable({
  spec,
  rows,
  sort,
  total,
  page,
  size,
  canWrite,
  hideClass,
}: {
  spec: FacetDef[];
  rows: SessionListRow[];
  sort: SortState<SessionSortColumn>;
  total: number;
  page: number;
  size: number;
  canWrite: boolean;
  hideClass?: boolean;
}) {
  const columns = hideClass ? NESTED_COLUMNS : COLUMNS;
  return (
    <div className="space-y-4">
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.publicId}
        sort={sort}
        idAccessor={(row) => row.publicId}
        idHref={(row) => `/dashboard/sessions/${row.publicId}`}
        search={{ placeholder: "Search sessions…", shortPlaceholder: "Search…", debounceMs: 250 }}
        filters={<FacetFilters spec={spec} />}
        emptyIcon={CalendarDaysIcon}
        emptyMessage="No sessions yet."
        emptySearchMessage="No sessions match your search."
        renderRow={(row) => (
          <>
            {hideClass ? null : <TableCell className="font-medium">{row.title}</TableCell>}
            <TableCell className="whitespace-nowrap tabular-nums">
              {row.occursOn}
              <span className="text-muted-foreground mt-1 block text-xs">{row.timeLabel}</span>
            </TableCell>
            <TableCell>{CATEGORY_LABELS[row.category]}</TableCell>
            <TableCell>
              <Badge variant={row.published ? "default" : "outline"}>{row.published ? "Published" : "Draft"}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.remaining}/{row.capacity}
            </TableCell>
            <TableCell>
              <SessionRowActions publicId={row.publicId} canWrite={canWrite} />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function SessionsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
