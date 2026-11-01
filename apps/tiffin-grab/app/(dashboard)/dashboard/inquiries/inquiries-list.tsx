"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatPhone } from "@foundry/commons";
import {
  CalendarClockIcon, ClipboardListIcon, MessageSquarePlusIcon, ShoppingBagIcon,
} from "lucide-react";
import { DataTable, ListPagination, RowActionTooltipButton, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { TableCell } from "@foundry/ui/table";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Badge } from "@/components/reui/badge";
import type { SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { displayName } from "@/lib/inquiries/display";
import { SUB_STATUSES, SUB_STATUS_META, isClosed, type SubStatus } from "@/lib/inquiries/status";
import { bulkSetStatus, reassignInquiries } from "./actions";
import { NoteDialog, StatusMenu, type NoteKind } from "./_leads/status-dialog";

type InquirySortColumn = "name" | "owner" | "stage" | "source" | "nextFollowUp" | "created";
type StaffOption = { publicId: string; name: string };

// Single source of truth for the table's columns: DataTable renders the header
// and DataTable.Skeleton the loading twin from this array, so they cannot drift.
const COLUMNS: readonly Column<InquirySortColumn | "select" | "lastNote" | "actions">[] = [
  { key: "select", label: "", width: "w-10" },
  { key: "name", label: "Lead", sortable: true },
  { key: "stage", label: "Status", sortable: true, width: "w-48" },
  { key: "nextFollowUp", label: "Next follow-up", sortable: true, width: "w-40" },
  { key: "owner", label: "Owner", sortable: true, width: "w-28" },
  { key: "lastNote", label: "Last note" },
  { key: "actions", label: "", align: "right", width: "w-32" },
];

const DAY_MS = 86_400_000;

// ponytail: only open sub-statuses plus Undeliverable; Lost needs a per-lead reason, took_* is convert-only.
const BULK_STATUSES = SUB_STATUSES.filter((s) => (SUB_STATUS_META[s].pickable && !SUB_STATUS_META[s].closes) || s === "undeliverable");

type RowDialog =
  | { id: string; kind: "note"; note: NoteKind };

function RowActions({ r, onOpenDialog }: { r: PipelineRow; onOpenDialog: (d: RowDialog) => void }) {
  const router = useRouter();
  const name = displayName(r);
  return (
    <div className="flex items-center justify-end gap-0.5">
      <RowActionTooltipButton icon={MessageSquarePlusIcon} tone="text-violet-600 dark:text-violet-400" label={`Add note for ${name}`} hint="Add note" onClick={() => onOpenDialog({ id: r.publicId, kind: "note", note: "note" })} />
      {isClosed(r.subStatus as SubStatus | null) ? null : (
        <>
        <RowActionTooltipButton icon={CalendarClockIcon} tone="text-teal-600 dark:text-teal-400" label={`Set follow-up for ${name}`} hint="Set follow-up" onClick={() => onOpenDialog({ id: r.publicId, kind: "note", note: "follow_up" })} />
        <RowActionTooltipButton icon={ShoppingBagIcon} tone="text-primary" label={`Convert ${name} to order`} hint="Convert to order" onClick={() => router.push(`/dashboard/inquiries/${r.publicId}?convert=1`)} />
        </>
      )}
    </div>
  );
}

function BulkBar({
  selectedIds, pageIds, staff, onChange,
}: {
  selectedIds: string[];
  pageIds: string[];
  staff: StaffOption[];
  onChange: (next: Set<string>) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<SubStatus | undefined>(undefined);
  const n = selectedIds.length;
  if (n === 0) return null;

  function reassign() {
    if (!ownerId) return;
    start(async () => {
      try {
        const done = await reassignInquiries(selectedIds, ownerId);
        const name = staff.find((s) => s.publicId === ownerId)?.name ?? "staff";
        toast(`${done} ${done === 1 ? "inquiry" : "inquiries"} reassigned to ${name}`);
        onChange(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not reassign");
      }
    });
  }
  function applyStatus() {
    if (!status) return;
    start(async () => {
      try {
        const { updated, skipped } = await bulkSetStatus(selectedIds, status);
        toast(`${updated} updated${skipped ? `, ${skipped} skipped (closed or converted)` : ""}`);
        onChange(new Set());
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update status");
      }
    });
  }
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
      <span className="text-sm font-medium">{n} selected</span>
      {n < pageIds.length ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onChange(new Set(pageIds))}>Select all on page</Button>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Select value={ownerId} onValueChange={setOwnerId}>
          <SelectTrigger className="w-44" aria-label="New owner"><SelectValue placeholder="Reassign to…" /></SelectTrigger>
          <SelectContent>
            {staff.map((s) => <SelectItem key={s.publicId} value={s.publicId}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={pending || !ownerId} onClick={reassign}>Reassign</Button>
        <Select value={status} onValueChange={(v) => setStatus(v as SubStatus)}>
          <SelectTrigger className="w-48" aria-label="New status"><SelectValue placeholder="Update status…" /></SelectTrigger>
          <SelectContent>
            {BULK_STATUSES.map((s) => <SelectItem key={s} value={s}>{SUB_STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={pending || !status} onClick={applyStatus}>Apply</Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => onChange(new Set())}>Clear</Button>
      </div>
    </div>
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
  staff?: StaffOption[];
  reassignAction?: (inquiryId: string, ownerId: string) => Promise<void>;
  dayStart: number;
}) {
  const tz = useTimezone();
  const router = useRouter();
  const bulk = Boolean(canReassign && staff && staff.length > 0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [dialog, setDialog] = useState<RowDialog | null>(null);
  // Selection is per page: drop ids that left the page after a refresh or page change.
  const onPage = rows.filter((r) => selected.has(r.publicId)).map((r) => r.publicId);
  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }
  const active = dialog ? rows.find((r) => r.publicId === dialog.id) : undefined;
  const close = (open: boolean) => { if (!open) setDialog(null); };

  return (
    <div className="flex flex-col gap-4">
      {bulk && staff ? (
        <BulkBar selectedIds={onPage} pageIds={rows.map((r) => r.publicId)} staff={staff} onChange={setSelected} />
      ) : null}
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        onRowClick={(r) => router.push(`/dashboard/inquiries/${r.publicId}`)}
        rowClassName={() => "group"}
        filters={<ListSearchFilters spec={spec} placeholder="Search inquiries…" shortPlaceholder="Search…" dateControl="external" />}
        emptyIcon={ClipboardListIcon}
        emptyMessage={emptyMessage}
        emptySearchMessage="No inquiries match your search."
        emptyAction={emptyCta}
        mobileCard={(r) => {
          const sub = r.subStatus as SubStatus | null;
          return (
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col gap-1">
                <Link href={`/dashboard/inquiries/${r.publicId}`} className="truncate font-medium">{displayName(r)}</Link>
                <span className="text-muted-foreground text-xs">{r.phone ? formatPhone(r.phone) : "No phone"} · {r.source}</span>
                <div><StatusMenu inquiryId={r.publicId} subStatus={sub} /></div>
              </div>
              <RowActions r={r} onOpenDialog={setDialog} />
            </div>
          );
        }}
        renderRow={(r) => {
          const sub = r.subStatus as SubStatus | null;
          const open = !isClosed(sub);
          const next = r.nextFollowUpAt;
          return (
            <>
              <TableCell>
                {bulk ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${displayName(r)}`}
                    checked={selected.has(r.publicId)}
                    onChange={(e) => toggle(r.publicId, e.target.checked)}
                    className="size-4"
                  />
                ) : null}
              </TableCell>
              <TableCell className="font-medium">
                <Link href={`/dashboard/inquiries/${r.publicId}`} className="group-hover:underline">{displayName(r)}</Link>
                <div className="text-muted-foreground truncate text-xs">
                  {r.phone ? formatPhone(r.phone) : "No phone"} · {r.source}
                </div>
              </TableCell>
              <TableCell>
                <StatusMenu inquiryId={r.publicId} subStatus={sub} />
              </TableCell>
              <TableCell>
                {next != null ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="tabular-nums">{formatEpoch(next, { mode: "date", timeZone: tz })}</span>
                    {open && next < dayStart ? <Badge variant="destructive-light">Overdue</Badge> : null}
                    {open && next >= dayStart && next < dayStart + DAY_MS ? <Badge variant="success-light">Today</Badge> : null}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell>{r.ownerName ?? "—"}</TableCell>
              <TableCell className="text-muted-foreground truncate" title={r.lastNote ?? undefined}>
                {r.lastNote ?? "—"}
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <RowActions r={r} onOpenDialog={setDialog} />
                </div>
              </TableCell>
            </>
          );
        }}
      />
      <ListPagination page={page} size={size} total={total} />

      {active && dialog?.kind === "note" ? (
        <NoteDialog key={`${active.publicId}-${dialog.note}`} open onOpenChange={close} inquiryId={active.publicId} timeZone={tz} kind={dialog.note} />
      ) : null}
    </div>
  );
}

export function InquiriesListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
