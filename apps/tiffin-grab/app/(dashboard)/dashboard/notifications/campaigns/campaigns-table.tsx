"use client";

import { MegaphoneIcon, PencilIcon } from "lucide-react";
import {
  DataTable,
  ListPagination,
  RowActionButton,
  RowActions,
  type Column,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
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
  { key: "progress", label: "Queued / delivered", align: "right" },
  { key: "createdAt", label: "Created", sortable: true, align: "right" },
  { key: "actions", label: "Actions", align: "right", width: "w-16" },
];

const STATUS_TONE: Record<string, "secondary" | "outline"> = {
  sent: "secondary",
  sending: "secondary",
};

export function CampaignsTable({
  spec,
  rows,
  sort,
  total,
  page,
  size,
}: {
  spec: FacetDef[];
  rows: CampaignRow[];
  sort: SortState<CampaignSortColumn>;
  total: number;
  page: number;
  size: number;
}) {
  return (
    <div className="space-y-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
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
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {r.counts?.queued ?? 0} / {r.counts?.delivered ?? 0}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {new Date(r.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <RowActions>
                <RowActionButton
                  icon={PencilIcon}
                  label="Open campaign"
                  href={`/dashboard/notifications/campaigns/${r.publicId}`}
                />
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
  return <DataTable.Skeleton columns={COLUMNS} />;
}
