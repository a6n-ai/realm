"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import {
  DataTable, FacetFilters, ListPagination, StageBadge, type Column, type FacetDef,
} from "@/components/ds";
import { TableCell } from "@realm/ui/table";
import { Badge } from "@realm/ui/badge";
import type { SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { ReassignControl } from "@/components/reassign/reassign-control";

type InquirySortColumn = "name" | "owner" | "stage" | "source" | "lastTouch" | "created";

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<InquirySortColumn | "nextAction">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "owner", label: "Owner", sortable: true },
  { key: "stage", label: "Stage", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "lastTouch", label: "Last touch", sortable: true, align: "right" },
  { key: "nextAction", label: "Next action", align: "right" },
  { key: "created", label: "Created", sortable: true, align: "right" },
];

export function InquiriesList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  emptyCta,
  canReassign,
  staff,
  reassignAction,
}: {
  spec: FacetDef[];
  rows: PipelineRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<InquirySortColumn>;
  emptyCta?: ReactNode;
  canReassign?: boolean;
  staff?: { publicId: string; name: string }[];
  reassignAction?: (inquiryId: string, ownerId: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/inquiries/${r.publicId}`}
        rowClassName={() => "group cursor-pointer"}
        filters={<FacetFilters spec={spec} />}
        emptyIcon={ClipboardListIcon}
        emptyMessage="No inquiries yet."
        emptySearchMessage="No inquiries match your search."
        emptyAction={emptyCta}
        renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            <Link
              href={`/dashboard/inquiries/${r.publicId}`}
              className="group-hover:underline"
            >
              {r.fullName}
            </Link>
            <div className="text-muted-foreground text-xs">{r.phone}</div>
          </TableCell>
          <TableCell>
            {canReassign && staff && reassignAction ? (
              <ReassignControl
                currentOwnerId={r.ownerId}
                currentOwnerName={r.ownerName}
                staff={staff}
                action={(ownerId) => reassignAction(r.publicId, ownerId)}
              />
            ) : (
              (r.ownerName ?? "—")
            )}
          </TableCell>
          <TableCell>
            <StageBadge stage={r.stage} />
          </TableCell>
          <TableCell>{r.source}</TableCell>
          <TableCell className="text-right tabular-nums">
            {r.lastTouchAt != null
              ? formatEpoch(r.lastTouchAt, { mode: "datetime" })
              : "—"}
          </TableCell>
          <TableCell className="text-right">
            {r.nextFollowUpAt != null ? (
              <span className="inline-flex items-center gap-2">
                <span className="tabular-nums">
                  {formatEpoch(r.nextFollowUpAt, { mode: "date" })}
                </span>
                {r.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
              </span>
            ) : (
              "—"
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatEpoch(r.createdAt, { mode: "date" })}
          </TableCell>
        </>
      )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function InquiriesListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
