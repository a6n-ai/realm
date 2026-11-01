"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPhone } from "@foundry/commons";
import { ClipboardListIcon, MessageSquarePlusIcon } from "lucide-react";
import {
  DataTable, ListPagination, type Column, type FacetDef,
} from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { TableCell } from "@foundry/ui/table";
import { Button } from "@foundry/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Textarea } from "@foundry/ui/textarea";
import { Badge } from "@/components/reui/badge";
import type { SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { ReassignControl } from "@/components/reassign/reassign-control";
import { displayName } from "@/lib/inquiries/display";
import { isClosed, type SubStatus } from "@/lib/inquiries/status";
import { addNote } from "./actions";
import { FollowUpPicker, StatusPill, StatusPopup } from "./_leads/status-popup";

type InquirySortColumn = "name" | "owner" | "stage" | "source" | "nextFollowUp" | "created";

// Single source of truth for the table's columns. DataTable renders the header
// and DataTable.Skeleton renders the loading twin from this same array, so the
// two can never drift.
const COLUMNS: readonly Column<InquirySortColumn | "lastNote" | "actions">[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "stage", label: "Status", sortable: true },
  { key: "lastNote", label: "Last note" },
  { key: "nextFollowUp", label: "Next follow-up", sortable: true },
  { key: "owner", label: "Owner", sortable: true },
  { key: "source", label: "Source", sortable: true },
  { key: "actions", label: "", align: "right" },
];

function NoteAction({ inquiryId, timeZone }: { inquiryId: string; timeZone: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<{ key: "tomorrow" | "3d" | "1w" | "date"; at: number; iso?: string } | null>(null);
  function save() {
    start(async () => {
      try {
        await addNote(inquiryId, note.trim(), followUp?.at);
        setOpen(false);
        setNote("");
        setFollowUp(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save note");
      }
    });
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><MessageSquarePlusIcon className="size-4" />Note</Button>
      </PopoverTrigger>
      <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3" align="end" onClick={(e) => e.stopPropagation()}>
        <Textarea placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
        <FollowUpPicker timeZone={timeZone} value={followUp} onChange={setFollowUp} />
        <Button disabled={pending || note.trim() === ""} onClick={save}>Save note</Button>
      </PopoverContent>
    </Popover>
  );
}

export function InquiriesList({
  spec,
  rows,
  total,
  page,
  size,
  sort,
  emptyCta,
  emptyMessage,
  canReassign,
  staff,
  reassignAction,
  dayStart,
}: {
  spec: FacetDef[];
  rows: PipelineRow[];
  total: number;
  page: number;
  size: number;
  sort: SortState<InquirySortColumn>;
  emptyCta?: ReactNode;
  emptyMessage: string;
  canReassign?: boolean;
  staff?: { publicId: string; name: string }[];
  reassignAction?: (inquiryId: string, ownerId: string) => Promise<void>;
  dayStart: number;
}) {
  const tz = useTimezone();
  return (
    <div className="space-y-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        idAccessor={(r) => r.publicId}
        idHref={(r) => `/dashboard/inquiries/${r.publicId}`}
        rowClassName={() => "group cursor-pointer"}
        filters={<ListSearchFilters spec={spec} placeholder="Search inquiries…" shortPlaceholder="Search…" dateControl="external" />}
        emptyIcon={ClipboardListIcon}
        emptyMessage={emptyMessage}
        emptySearchMessage="No inquiries match your search."
        emptyAction={emptyCta}
        renderRow={(r) => {
          const sub = r.subStatus as SubStatus | null;
          return (
            <>
              <TableCell className="font-medium">
                <Link href={`/dashboard/inquiries/${r.publicId}`} className="group-hover:underline">
                  {displayName(r)}
                </Link>
                <div className="text-muted-foreground text-xs">{r.phone ? formatPhone(r.phone) : "No phone"}</div>
              </TableCell>
              <TableCell>
                <StatusPopup
                  inquiryId={r.publicId}
                  subStatus={sub}
                  timeZone={tz}
                  trigger={<button type="button" aria-label="Change status" className="cursor-pointer"><StatusPill subStatus={sub} /></button>}
                />
              </TableCell>
              <TableCell className="text-muted-foreground max-w-56 truncate" title={r.lastNote ?? undefined}>
                {r.lastNote ?? "—"}
              </TableCell>
              <TableCell>
                {r.nextFollowUpAt != null ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular-nums">{formatEpoch(r.nextFollowUpAt, { mode: "date", timeZone: tz })}</span>
                    {!isClosed(sub) && r.nextFollowUpAt < dayStart ? <Badge variant="destructive-light">Overdue</Badge> : null}
                  </span>
                ) : (
                  "—"
                )}
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
              <TableCell>{r.source}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  {isClosed(sub) ? null : <NoteAction inquiryId={r.publicId} timeZone={tz} />}
                  {isClosed(sub) ? null : (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/dashboard/inquiries/${r.publicId}?convert=1`}>Convert</Link>
                    </Button>
                  )}
                </div>
              </TableCell>
            </>
          );
        }}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

// Loading twin is now owned by DataTable — same COLUMNS, zero drift.
export function InquiriesListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}
