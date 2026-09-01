"use client";

import { CalendarHeartIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { DataTable, ListPagination, type Column, type FacetDef } from "@foundry/design-system";
import { TableCell } from "@foundry/ui/table";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { CateringInquiryRow, CateringSortColumn } from "@/lib/services/catering.service";

// submittedLabel is formatted server-side (Toronto zone) — see the note in page.tsx's sibling pages.
type Row = CateringInquiryRow & { submittedLabel: string };

const COLUMNS: readonly Column<CateringSortColumn>[] = [
  { key: "submitted", label: "Submitted", sortable: true },
  { key: "name", label: "Name", sortable: true },
  { key: "contact", label: "Contact" },
  { key: "eventDate", label: "Event date", sortable: true },
  { key: "location", label: "Location" },
  { key: "guests", label: "Guests", sortable: true, align: "right" },
  { key: "type", label: "Type" },
  { key: "notes", label: "Notes" },
];

export function CateringTable({
  spec,
  rows,
  total,
  page,
  size,
  sort,
}: {
  spec: FacetDef[];
  rows: Row[];
  total: number;
  page: number;
  size: number;
  sort: SortState<CateringSortColumn>;
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
          placeholder: "Search name, phone or email…",
          shortPlaceholder: "Search…",
          debounceMs: 250,
        }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={CalendarHeartIcon}
        emptyMessage="No catering requests yet."
        emptySearchMessage="No requests match your filters."
        renderRow={(r) => {
          const notes = [r.allergies, r.message].filter(Boolean).join(" — ");
          return (
            <>
              <TableCell className="whitespace-nowrap">{r.submittedLabel}</TableCell>
              <TableCell>{r.name}</TableCell>
              <TableCell className="whitespace-nowrap">
                <div>{formatPhone(r.phone)}</div>
                <div className="text-muted-foreground text-xs">{r.email}</div>
              </TableCell>
              <TableCell className="whitespace-nowrap">{r.eventDate}</TableCell>
              <TableCell>{r.location}</TableCell>
              <TableCell className="text-right tabular-nums">{r.guests}</TableCell>
              <TableCell>{r.eventType}</TableCell>
              <TableCell className="max-w-xs truncate" title={notes}>
                {notes || "—"}
              </TableCell>
            </>
          );
        }}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CateringTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
