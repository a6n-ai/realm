"use client";

import { MegaphoneIcon } from "lucide-react";
import { DataTable, ListPagination, RowActions, type Column, type FacetDef } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { CampaignDuplicateButton, CampaignRetriggerButton, type ContactListOption } from "@relay/engine/ui";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import type { SortState } from "@/lib/list/sort";
import type { CampaignSortColumn } from "./page";

export type CampaignRow = {
  publicId: string;
  name: string;
  channels: string[];
  status: string;
  scheduledAt: number | null;
  sentAt: number | null;
  counts: Record<string, number>;
  createdAt: number;
};

const COLUMNS: readonly Column<CampaignSortColumn | "channels" | "progress" | "actions">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "channels", label: "Channels" },
  { key: "status", label: "Status", sortable: true },
  { key: "progress", label: "Delivery", align: "right", width: "w-40" },
  { key: "createdAt", label: "Created", sortable: true, align: "right" },
  { key: "actions", label: "Actions", align: "right", width: "w-20" },
];

const STATUS_TONE: Record<string, "secondary" | "outline"> = {
  sent: "secondary",
  sending: "secondary",
};

const RETRIGGERABLE = new Set(["sent", "paused", "cancelled"]);

function DeliveryProgress({ counts }: { counts: Record<string, number> }) {
  const queued = counts?.queued ?? 0;
  const delivered = counts?.delivered ?? 0;
  const bounced = counts?.bounced ?? 0;
  const pct = queued > 0 ? Math.min(100, Math.round((delivered / queued) * 100)) : 0;
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-xs tabular-nums text-muted-foreground">
        {delivered} / {queued}
        {bounced > 0 && <span className="text-destructive"> · {bounced} bounced</span>}
      </span>
      <div className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function CampaignsTable({
  spec,
  rows,
  sort,
  total,
  page,
  size,
  lists,
  timeZone,
}: {
  spec: FacetDef[];
  rows: CampaignRow[];
  sort: SortState<CampaignSortColumn>;
  total: number;
  page: number;
  size: number;
  lists: ContactListOption[];
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
        idHref={(r) => `/dashboard/notifications/campaigns/${r.publicId}`}
        search={{ placeholder: "Search campaigns…", shortPlaceholder: "Search…", keys: ["name"] }}
        filters={<ReuiFacetFilters spec={spec} />}
        emptyIcon={MegaphoneIcon}
        emptyMessage="No campaigns yet."
        emptySearchMessage="No campaigns match your search."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell className="text-muted-foreground">{r.channels.join(", ")}</TableCell>
            <TableCell>
              <Badge variant={STATUS_TONE[r.status] ?? "outline"}>{r.status}</Badge>
            </TableCell>
            <TableCell className="text-right">
              <DeliveryProgress counts={r.counts} />
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <RowActions>
                <CampaignDuplicateButton campaignPublicId={r.publicId} lists={lists} timeZone={timeZone} compact />
                {RETRIGGERABLE.has(r.status) && (
                  <CampaignRetriggerButton campaignPublicId={r.publicId} lists={lists} compact />
                )}
              </RowActions>
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function CampaignsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
