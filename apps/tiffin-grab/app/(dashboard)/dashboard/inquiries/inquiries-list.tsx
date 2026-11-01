"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { formatPhone } from "@foundry/commons";
import { CalendarClockIcon, ClipboardListIcon, MessageSquarePlusIcon } from "lucide-react";
import { EmptyState, ListPagination, useSortNav, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { Button } from "@foundry/ui/button";
import { Card, CardContent } from "@foundry/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Skeleton } from "@foundry/ui/skeleton";
import { Textarea } from "@foundry/ui/textarea";
import { Badge } from "@/components/reui/badge";
import type { SortState } from "@/lib/list/sort";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { PipelineRow } from "@/lib/services/inquiries.service";
import { ReassignControl } from "@/components/reassign/reassign-control";
import { displayName } from "@/lib/inquiries/display";
import { isClosed, type SubStatus } from "@/lib/inquiries/status";
import { addNote, reassignInquiries } from "./actions";
import { FollowUpPicker, StatusPill, StatusPopup } from "./_leads/status-popup";

type InquirySortColumn = "name" | "owner" | "stage" | "source" | "nextFollowUp" | "created";

const SORTS: { value: `${InquirySortColumn}:${"asc" | "desc"}`; label: string }[] = [
  { value: "nextFollowUp:asc", label: "Follow-up: soonest first" },
  { value: "created:desc", label: "Newest first" },
  { value: "created:asc", label: "Oldest first" },
  { value: "name:asc", label: "Name A–Z" },
  { value: "stage:asc", label: "Status" },
  { value: "owner:asc", label: "Owner" },
  { value: "source:asc", label: "Source" },
];

function SortSelect({ sort }: { sort: SortState<InquirySortColumn> }) {
  const sortNav = useSortNav();
  const value = `${sort.column}:${sort.dir}`;
  return (
    <Select
      value={SORTS.some((s) => s.value === value) ? value : undefined}
      onValueChange={(v) => {
        const [column, dir] = v.split(":") as [InquirySortColumn, "asc" | "desc"];
        sortNav(column, dir);
      }}
    >
      <SelectTrigger className="w-52" aria-label="Sort inquiries"><SelectValue placeholder="Sort" /></SelectTrigger>
      <SelectContent>
        {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

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
      <PopoverContent className="flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-3" align="start">
        <Textarea placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
        <FollowUpPicker timeZone={timeZone} value={followUp} onChange={setFollowUp} />
        <Button disabled={pending || note.trim() === ""} onClick={save}>Save note</Button>
      </PopoverContent>
    </Popover>
  );
}

function Meta({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="truncate text-sm">{children}</span>
    </div>
  );
}

function LeadCard({
  r, tz, dayStart, canReassign, staff, reassignAction, selected, onSelect,
}: {
  r: PipelineRow;
  tz: string;
  dayStart: number;
  canReassign?: boolean;
  staff?: { publicId: string; name: string }[];
  reassignAction?: (inquiryId: string, ownerId: string) => Promise<void>;
  selected?: boolean;
  onSelect?: (checked: boolean) => void;
}) {
  const sub = r.subStatus as SubStatus | null;
  const closed = isClosed(sub);
  const href = `/dashboard/inquiries/${r.publicId}`;
  const overdue = !closed && r.nextFollowUpAt != null && r.nextFollowUpAt < dayStart;
  return (
    <Card>
      <CardContent className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {onSelect ? (
            <input
              type="checkbox"
              aria-label={`Select ${displayName(r)}`}
              checked={!!selected}
              onChange={(e) => onSelect(e.target.checked)}
              className="mt-1 size-4 shrink-0"
            />
          ) : null}
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={href} className="truncate font-medium hover:underline">{displayName(r)}</Link>
          <span className="text-muted-foreground text-xs tabular-nums">{r.phone ? formatPhone(r.phone) : "No phone"}</span>
          </div>
        </div>
        <StatusPopup
          inquiryId={r.publicId}
          subStatus={sub}
          timeZone={tz}
          trigger={<button type="button" aria-label="Change status" className="shrink-0 cursor-pointer"><StatusPill subStatus={sub} /></button>}
        />
      </div>

      <p className={r.lastNote ? "line-clamp-2 text-sm" : "text-muted-foreground text-sm"} title={r.lastNote ?? undefined}>
        {r.lastNote ?? "No notes yet"}
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Meta label="Next follow-up">
          {r.nextFollowUpAt != null ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClockIcon className="text-muted-foreground size-3.5" />
              <span className="tabular-nums">{formatEpoch(r.nextFollowUpAt, { mode: "date", timeZone: tz })}</span>
            </span>
          ) : closed ? "—" : "Not set"}
        </Meta>
        <Meta label="Source">{r.source}</Meta>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-muted-foreground text-xs">Owner</span>
          {canReassign && staff && reassignAction ? (
            <ReassignControl
              currentOwnerId={r.ownerId}
              currentOwnerName={r.ownerName}
              staff={staff}
              action={(ownerId) => reassignAction(r.publicId, ownerId)}
            />
          ) : (
            <span className="truncate text-sm">{r.ownerName ?? "—"}</span>
          )}
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {overdue ? <Badge variant="destructive-light">Overdue</Badge> : null}
        <span className="text-muted-foreground text-xs">Added {formatEpoch(r.createdAt, { mode: "date", timeZone: tz })}</span>
        <div className="ml-auto flex items-center gap-2">
          {closed ? null : <NoteAction inquiryId={r.publicId} timeZone={tz} />}
          {closed ? null : (
            <Button variant="outline" size="sm" asChild>
              <Link href={`${href}?convert=1`}>Convert</Link>
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href={href}>Open</Link>
          </Button>
        </div>
      </div>
      </CardContent>
    </Card>
  );
}

function BulkBar({
  selectedIds, pageIds, staff, onChange,
}: {
  selectedIds: string[];
  pageIds: string[];
  staff: { publicId: string; name: string }[];
  onChange: (next: Set<string>) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ownerId, setOwnerId] = useState<string | undefined>(undefined);
  const n = selectedIds.length;
  const allOnPage = n > 0 && n === pageIds.length;
  function apply() {
    if (!ownerId || n === 0) return;
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
  return (
    <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          aria-label="Select all on this page"
          checked={allOnPage}
          ref={(el) => { if (el) el.indeterminate = n > 0 && !allOnPage; }}
          onChange={(e) => onChange(new Set(e.target.checked ? pageIds : []))}
          className="size-4 shrink-0"
        />
        {n > 0 ? `${n} selected` : "Select all on this page"}
      </label>
      {n > 0 ? (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={ownerId} onValueChange={setOwnerId}>
            <SelectTrigger className="w-44" aria-label="New owner"><SelectValue placeholder="Reassign to…" /></SelectTrigger>
            <SelectContent>
              {staff.map((s) => <SelectItem key={s.publicId} value={s.publicId}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={pending || !ownerId} onClick={apply}>Reassign {n}</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => onChange(new Set())}>Clear</Button>
        </div>
      ) : null}
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
  staff?: { publicId: string; name: string }[];
  reassignAction?: (inquiryId: string, ownerId: string) => Promise<void>;
  dayStart: number;
}) {
  const tz = useTimezone();
  const searching = Boolean(useSearchParams().get("q"));
  const bulk = canReassign && staff && staff.length > 0;
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // Selection is per page: drop ids that left the page after a refresh or page change.
  const onPage = rows.filter((r) => selected.has(r.publicId)).map((r) => r.publicId);
  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <ListSearchFilters spec={spec} placeholder="Search inquiries…" shortPlaceholder="Search…" dateControl="external" />
        </div>
        <SortSelect sort={sort} />
      </div>

      {bulk && rows.length > 0 ? (
        <BulkBar
          selectedIds={onPage}
          pageIds={rows.map((r) => r.publicId)}
          staff={staff}
          onChange={setSelected}
        />
      ) : null}

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardListIcon}
            message={searching ? "No inquiries match your search." : emptyMessage}
            action={searching ? undefined : emptyCta}
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => (
            <LeadCard
              key={r.publicId}
              r={r}
              tz={tz}
              dayStart={dayStart}
              canReassign={canReassign}
              staff={staff}
              reassignAction={reassignAction}
              selected={selected.has(r.publicId)}
              onSelect={bulk ? (on) => toggle(r.publicId, on) : undefined}
            />
          ))}
        </div>
      )}
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function InquiriesListSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-52" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-4 w-full" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
            <div className="flex justify-end gap-2">
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-8 w-20" />
            </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
