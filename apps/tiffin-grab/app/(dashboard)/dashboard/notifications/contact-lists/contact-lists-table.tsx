"use client";

import { ListIcon } from "lucide-react";
import { DataTable, ListPagination, RowActions, type Column, type FacetDef } from "@foundry/design-system";
import { TableCell } from "@foundry/ui/table";
import { ContactListResyncButton, formatConsentDate } from "@relay/engine/ui";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { ContactListSortColumn } from "./page";

export type ContactListRow = {
  publicId: string;
  name: string;
  consentSource: string;
  consentAt: number;
  consentNote: string | null;
  memberCount: number;
  createdAt: number;
  isSegment: boolean;
};

const CONSENT_LABEL: Record<string, string> = {
  purchase: "Purchase (expires after 24 months)",
  express_optin: "Express opt-in",
  event_signup: "Event signup",
  import_other: "Other",
};

const COLUMNS: readonly Column<ContactListSortColumn | "consent" | "actions">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "consent", label: "Consent" },
  { key: "memberCount", label: "Contacts", sortable: true, align: "right" },
  { key: "createdAt", label: "Created", sortable: true, align: "right" },
  { key: "actions", label: "Actions", align: "right", width: "w-16" },
];

export function ContactListsTable({
  spec,
  rows,
  sort,
  total,
  page,
  size,
  timeZone,
}: {
  spec: FacetDef[];
  rows: ContactListRow[];
  sort: SortState<ContactListSortColumn>;
  total: number;
  page: number;
  size: number;
  timeZone: string;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/notifications/contact-lists/${r.publicId}`}
        search={{ placeholder: "Search lists…", shortPlaceholder: "Search…", keys: ["name"] }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={ListIcon}
        emptyMessage="No lists yet."
        emptySearchMessage="No lists match your search."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell className="text-muted-foreground text-xs">
              {CONSENT_LABEL[r.consentSource] ?? r.consentSource} · {formatConsentDate(r.consentAt, timeZone)}
              {r.consentNote ? ` · ${r.consentNote}` : ""}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">{r.memberCount}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>{r.isSegment && <RowActions><ContactListResyncButton publicId={r.publicId} /></RowActions>}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function ContactListsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
