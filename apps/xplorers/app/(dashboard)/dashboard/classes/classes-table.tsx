"use client";

import { ShapesIcon } from "lucide-react";
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
import type { ClassSortColumn } from "@/lib/services/studio-sessions.service";
import { ClassRowActions } from "./class-row-actions";

export type ClassListRow = {
  publicId: string;
  title: string;
  category: SessionCategory;
  timeLabel: string;
  capacity: number;
  published: boolean;
  sessionCount: number;
};

type Col = ClassSortColumn | "actions";

const COLUMNS: readonly Column<Col>[] = [
  { key: "title", label: "Name", sortable: true },
  { key: "category", label: "Category", sortable: true },
  { key: "startsAt", label: "Time", sortable: true },
  { key: "capacity", label: "Capacity", sortable: true, align: "right" },
  { key: "published", label: "Status", sortable: true },
  { key: "actions", label: "Actions", align: "right", width: "w-28" },
];

export function ClassesTable({
  spec,
  rows,
  sort,
  total,
  page,
  size,
  canWrite,
}: {
  spec: FacetDef[];
  rows: ClassListRow[];
  sort: SortState<ClassSortColumn>;
  total: number;
  page: number;
  size: number;
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.publicId}
        sort={sort}
        idAccessor={(row) => row.publicId}
        idHref={(row) => `/dashboard/classes/${row.publicId}`}
        search={{ placeholder: "Search classes…", shortPlaceholder: "Search…", debounceMs: 250 }}
        filters={<FacetFilters spec={spec} />}
        emptyIcon={ShapesIcon}
        emptyMessage="No classes yet."
        emptySearchMessage="No classes match your search."
        renderRow={(row) => (
          <>
            <TableCell className="font-medium">{row.title}</TableCell>
            <TableCell>{CATEGORY_LABELS[row.category]}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">{row.timeLabel}</TableCell>
            <TableCell className="text-right tabular-nums">{row.capacity}</TableCell>
            <TableCell>
              <Badge variant={row.published ? "default" : "outline"}>{row.published ? "Published" : "Draft"}</Badge>
              <span className="text-muted-foreground mt-1 block text-xs tabular-nums">
                {row.sessionCount} session{row.sessionCount === 1 ? "" : "s"}
              </span>
            </TableCell>
            <TableCell>
              <ClassRowActions publicId={row.publicId} published={row.published} canWrite={canWrite} />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function ClassesTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
