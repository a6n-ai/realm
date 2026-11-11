"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, MessageSquarePlusIcon, RefreshCwIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { DataTable, ListPagination, RowActionTooltipButton, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { humanDate } from "@/lib/deliveries-view";
import type { RenewalQueue } from "@/lib/renewals/filters";
import { isClosedTrack } from "@/lib/renewals/status";
import type { RenewalRow } from "@/lib/services/renewals.service";
import { TrackStatusMenu, TrackStatusPill } from "../renewals/_track/track-status";
import { TrackNoteDialog, type TrackNoteKind } from "../renewals/_track/track-note-dialog";
type QueueColumn = "customer" | "plan" | "last" | "status" | "followUp" | "activity" | "actions";
const COLUMNS: readonly Column<QueueColumn>[] = [
  // Sum stays under a laptop-width card so the table never scrolls sideways; DataTable stretches it on wider screens.
  { key: "customer", label: "Customer", width: "w-48" },
  { key: "plan", label: "Meal size", width: "w-32" },
  { key: "last", label: "Last tiffin", width: "w-28" },
  { key: "status", label: "Status", width: "w-32" },
  { key: "followUp", label: "Follow-up", width: "w-28" },
  { key: "activity", label: "Last activity", width: "w-32" },
  { key: "actions", label: "Actions", align: "right", width: "w-20" },
];
const EMPTY_COPY: Record<RenewalQueue, string> = {
  renew: "No plans ending in the next 7 days or lapsed in the last 14 days.",
  due: "Nobody to chase today.",
  overdue: "Nothing overdue.",
  upcoming: "No follow-ups scheduled.",
  open: "No open renewals in this date range.",
  closed: "No closed renewals in this date range.",
};
const ACTIVITY_LABEL: Record<string, string> = {
  note: "Note",
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  callback: "Callback",
  reminder_sent: "Reminder sent",
  status_change: "Status changed",
};
/** Add note and set follow-up for one plan; the dialog mounts only once opened. */
export function RowTrackActions({ orderPublicId, customerPublicId, closed }: { orderPublicId: string; customerPublicId: string; closed: boolean }) {
  const [kind, setKind] = useState<TrackNoteKind | null>(null);
  return (
    <>
      <RowActionTooltipButton icon={MessageSquarePlusIcon} tone="text-violet-600 dark:text-violet-400" label="Add note" hint="Log a note on this plan" onClick={() => setKind("note")} />
      {!closed && (
        <RowActionTooltipButton icon={CalendarClockIcon} tone="text-teal-600 dark:text-teal-400" label="Set follow-up" hint="Schedule when to follow up on this plan" onClick={() => setKind("follow_up")} />
      )}
      {kind && (
        <TrackNoteDialog
          orderPublicId={orderPublicId}
          customerPublicId={customerPublicId}
          kind={kind}
          open
          onOpenChange={(open) => !open && setKind(null)}
          closed={closed}
        />
      )}
    </>
  );
}
export function RenewalsQueueList({ rows, total, page, size, queue, today, spec }: { rows: RenewalRow[]; total: number; page: number; size: number; queue: RenewalQueue; today: string; spec: FacetDef[] }) {
  const tz = useTimezone();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.orderPublicId}
        // Clicks on the status menu and the row actions are excluded by DataTable.
        onRowClick={(r) => {
          if (r.customerPublicId) router.push(`/dashboard/inquiries/renewals/${r.customerPublicId}`);
        }}
        rowClassName={() => "group"}
        filters={<ListSearchFilters spec={spec} placeholder="Search name, order or phone…" shortPlaceholder="Search…" />}
        emptyIcon={RefreshCwIcon}
        emptyMessage={EMPTY_COPY[queue]}
        emptySearchMessage="No plans match your search."
        renderRow={(r) => {
          const closed = isClosedTrack(r.track);
          const followIso = r.nextFollowUpAt != null ? zonedDateIso(r.nextFollowUpAt, tz) : null;
          const overdue = followIso != null && followIso < today;
          return (
            <>
              {/* One line per cell keeps every row the same height; DataTable shows clipped text on hover. */}
              <TableCell className="font-medium whitespace-nowrap">
                {r.customerPublicId ? (
                  <Link href={`/dashboard/inquiries/renewals/${r.customerPublicId}`} className="hover:underline">
                    {r.customerName}
                  </Link>
                ) : (
                  r.customerName
                )}
                {r.phone && <span className="text-muted-foreground ml-2 text-xs font-normal tabular-nums">{r.phone}</span>}
              </TableCell>
              <TableCell title={r.mealSize}>
                <div className="flex min-w-0 items-center gap-1.5">
                  {r.trial && <Badge variant="secondary">Trial</Badge>}
                  <span className="truncate">{r.mealSize}</span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums" title={humanDate(r.lastTiffin)}>{humanDate(r.lastTiffin)}</TableCell>
              <TableCell className="whitespace-nowrap">
                {r.customerPublicId ? (
                  <TrackStatusMenu orderPublicId={r.orderPublicId} customerPublicId={r.customerPublicId} status={r.track} source={r.trackSource} />
                ) : (
                  <TrackStatusPill status={r.track} source={r.trackSource} />
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {followIso ? (
                  <span className={overdue ? "text-destructive" : undefined}>
                    {humanDate(followIso)}
                    {overdue && <span className="text-xs"> · overdue</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </TableCell>
              <TableCell>
                {r.lastActivity ? (
                  <span className="text-muted-foreground block truncate text-xs" title={r.lastActivity.note ?? ACTIVITY_LABEL[r.lastActivity.type] ?? r.lastActivity.type}>
                    {r.lastActivity.note ?? ACTIVITY_LABEL[r.lastActivity.type] ?? r.lastActivity.type}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">None yet</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                {r.customerPublicId && (
                  <div className="flex flex-nowrap items-center justify-end gap-1">
                    <RowTrackActions orderPublicId={r.orderPublicId} customerPublicId={r.customerPublicId} closed={closed} />
                  </div>
                )}
              </TableCell>
            </>
          );
        }}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}
