"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarClockIcon, MessageSquarePlusIcon } from "lucide-react";
import { RowActionTooltipButton } from "@/components/ds";
import { displayName } from "@/lib/inquiries/display";
import { isClosed, type SubStatus } from "@/lib/inquiries/status";
import { NoteDialog, StatusMenu, type NoteKind } from "./_leads/status-dialog";
import { FollowUpBadge } from "./follow-up-badge";
import type { UpNextRow } from "./next-lead-card";

type StripProps = { rows: UpNextRow[]; dayStart: number; dayEnd: number; now: number; timeZone: string; showOwner: boolean };

function UpNextCard({ row, dayStart, dayEnd, now, timeZone, showOwner }: Omit<StripProps, "rows"> & { row: UpNextRow }) {
  const [dialog, setDialog] = useState<NoteKind | null>(null);
  const name = displayName(row);
  const subStatus = row.subStatus as SubStatus | null;
  return (
    <div className="flex w-64 shrink-0 snap-start flex-col gap-2 rounded-lg border p-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link href={`/dashboard/inquiries/${row.publicId}`} className="truncate text-sm font-medium hover:underline">
          {name}
        </Link>
        {showOwner ? <span className="text-muted-foreground truncate text-xs">{row.ownerName ?? "Unassigned"}</span> : null}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <StatusMenu inquiryId={row.publicId} subStatus={subStatus} />
        <FollowUpBadge lead={row} dayStart={dayStart} dayEnd={dayEnd} now={now} timeZone={timeZone} />
      </div>
      <div className="flex items-center gap-0.5">
        <RowActionTooltipButton icon={MessageSquarePlusIcon} tone="text-violet-600 dark:text-violet-400" label={`Add note for ${name}`} hint="Add note" onClick={() => setDialog("note")} />
        {isClosed(subStatus) ? null : (
          <RowActionTooltipButton icon={CalendarClockIcon} tone="text-teal-600 dark:text-teal-400" label={`Set follow-up for ${name}`} hint="Set follow-up" onClick={() => setDialog("follow_up")} />
        )}
      </div>
      {dialog ? (
        <NoteDialog key={dialog} inquiryId={row.publicId} timeZone={timeZone} kind={dialog} open onOpenChange={(open) => !open && setDialog(null)} />
      ) : null}
    </div>
  );
}

export function UpNextStrip({ rows, ...shared }: StripProps) {
  return (
    <section aria-label="Up next leads" className="mt-3 border-t pt-3">
      <div tabIndex={0} className="focus-visible:ring-ring flex snap-x gap-3 overflow-x-auto pb-2 focus-visible:outline-none focus-visible:ring-2">
        {rows.map((row) => (
          <UpNextCard key={row.publicId} row={row} {...shared} />
        ))}
      </div>
    </section>
  );
}
