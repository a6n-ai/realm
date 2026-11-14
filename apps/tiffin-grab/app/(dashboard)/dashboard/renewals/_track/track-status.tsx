"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useCardRefresh } from "@/components/dashboard/next-item/recommendation-card";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import {
  ArrowRightIcon, BadgeCheckIcon, CalendarClockIcon, ChevronDownIcon, CreditCardIcon, PhoneMissedIcon, SparklesIcon,
  ThumbsUpIcon, XCircleIcon, type LucideIcon,
} from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { FollowUpPicker, type FollowUpValue } from "@/components/dashboard/pipeline/follow-up-picker";
import { ReasonDialog } from "@/components/dashboard/pipeline/reason-dialog";
import { StatusTileButton, TonePill } from "@/components/dashboard/pipeline/status-tile";
import { unwrapAction } from "@/lib/actions/unwrap";
import { isClosedTrack, TRACK_STATUSES, trackLabel, type TrackStatus } from "@/lib/renewals/status";
import { LOST_REASON_OPTIONS, type LostReason } from "@/lib/inquiries/lost-reason";
import { setTrackStatusAction } from "../actions";

type Look = { icon: LucideIcon; pill: string; text: string; tile: string };

// Categorical colours with dark pairs; shared meanings reuse the inquiry hues.
export const TRACK_LOOK: Record<TrackStatus | "new", Look> = {
  new: { icon: SparklesIcon, pill: "bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300", text: "text-sky-600 dark:text-sky-400", tile: "bg-sky-500/12 dark:bg-sky-400/15" },
  expected: { icon: ThumbsUpIcon, pill: "bg-lime-500/14 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300", text: "text-lime-600 dark:text-lime-400", tile: "bg-lime-500/14 dark:bg-lime-400/15" },
  pending_payment: { icon: CreditCardIcon, pill: "bg-amber-500/14 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400", tile: "bg-amber-500/14 dark:bg-amber-400/15" },
  follow_up: { icon: CalendarClockIcon, pill: "bg-indigo-500/12 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300", text: "text-indigo-600 dark:text-indigo-400", tile: "bg-indigo-500/12 dark:bg-indigo-400/15" },
  unresponsive: { icon: PhoneMissedIcon, pill: "bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400", tile: "bg-orange-500/12 dark:bg-orange-400/15" },
  not_renewed: { icon: XCircleIcon, pill: "bg-red-500/12 text-red-700 dark:bg-red-400/15 dark:text-red-300", text: "text-red-600 dark:text-red-400", tile: "bg-red-500/12 dark:bg-red-400/15" },
  renewed: { icon: BadgeCheckIcon, pill: "bg-emerald-500/14 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-500/14 dark:bg-emerald-400/15" },
};

const TRACK_OPTIONS: (TrackStatus | null)[] = [...TRACK_STATUSES, null];

export type TrackStatusProps = {
  orderPublicId: string;
  customerPublicId: string;
  status: TrackStatus | null;
  source: "staff" | "auto" | null;
};

export function TrackStatusPill({ status, source }: Pick<TrackStatusProps, "status" | "source">) {
  const { icon, pill } = TRACK_LOOK[status ?? "new"];
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
      <TonePill icon={icon} pill={pill} label={trackLabel(status)} />
      {source === "auto" ? <span className="text-muted-foreground text-xs">Auto</span> : null}
    </span>
  );
}

function BigStatus({ label, status }: { label: string; status: TrackStatus | null }) {
  const { icon: Icon, text, tile } = TRACK_LOOK[status ?? "new"];
  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", tile)}>
        <Icon className={cn("size-6", text)} aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-sm font-medium">{trackLabel(status)}</span>
      </div>
    </div>
  );
}

function ChangeStatusDialog({
  from, to, pending, onOpenChange, onSave,
}: {
  from: TrackStatus | null;
  to: TrackStatus | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note?: string, nextFollowUpAt?: number) => void;
}) {
  const tz = useTimezone();
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpValue | null>(null);
  // The service rejects a follow-up on a closed plan, so the picker only appears for open ones.
  const hideFollowUp = isClosedTrack(to);
  const submit = () => onSave(note.trim() || undefined, hideFollowUp ? undefined : followUp?.at);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{from === to ? "Update status" : "Change status"}</DialogTitle>
          <DialogDescription>Note and follow-up are optional. Save to apply.</DialogDescription>
        </DialogHeader>
        <div className="bg-muted/40 flex flex-wrap items-center gap-4 rounded-lg border p-3">
          <BigStatus label="Current" status={from} />
          {from === to ? null : (
            <>
              <ArrowRightIcon className="text-muted-foreground size-5" aria-hidden />
              <BigStatus label="Moving to" status={to} />
            </>
          )}
        </div>
        <Textarea
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
        />
        {hideFollowUp ? null : <FollowUpPicker timeZone={tz} value={followUp} onChange={setFollowUp} />}
        <DialogFooter>
          <Button autoFocus disabled={pending} onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Shared by the pill menu and the board: picking a status opens a dialog, Not renewed asks for its reason first.
function useTrackPick({ orderPublicId, customerPublicId, status }: TrackStatusProps) {
  const { refresh } = useCardRefresh();
  const [pending, start] = useTransition();
  const [reasonOpen, setReasonOpen] = useState(false);
  const [target, setTarget] = useState<{ to: TrackStatus | null } | null>(null);

  function save(to: TrackStatus | null, extra?: { lostReason?: LostReason; note?: string; nextFollowUpAt?: number }) {
    start(async () => {
      try {
        await unwrapAction(setTrackStatusAction(orderPublicId, customerPublicId, { status: to, ...extra }));
        setReasonOpen(false);
        setTarget(null);
        toast(`Status: ${trackLabel(to)}`);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update status");
      }
    });
  }

  function pick(to: TrackStatus | null) {
    if (to === "not_renewed") setReasonOpen(true);
    else setTarget({ to });
  }

  const dialogs = (
    <>
      {reasonOpen ? (
        <ReasonDialog
          open
          onOpenChange={setReasonOpen}
          pending={pending}
          title="Not renewed reason"
          confirmLabel="Mark not renewed"
          reasons={LOST_REASON_OPTIONS}
          onSave={(lostReason, note) => save("not_renewed", { lostReason, note })}
        />
      ) : null}
      {target ? (
        <ChangeStatusDialog
          key={target.to ?? "new"}
          from={status}
          to={target.to}
          pending={pending}
          onOpenChange={(open) => { if (!open) setTarget(null); }}
          onSave={(note, nextFollowUpAt) => save(target.to, { note, nextFollowUpAt })}
        />
      ) : null}
    </>
  );
  return { pick, pending, dialogs };
}

export function TrackStatusMenu(props: TrackStatusProps) {
  const { pick, pending, dialogs } = useTrackPick(props);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Change renewal status" disabled={pending} className="inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 disabled:opacity-60" onClick={(e) => e.stopPropagation()}>
            <TrackStatusPill status={props.status} source={props.source} />
            <ChevronDownIcon className="text-muted-foreground size-3.5 shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto" onClick={(e) => e.stopPropagation()}>
          {TRACK_OPTIONS.map((s) => {
            const { icon: Icon, text } = TRACK_LOOK[s ?? "new"];
            return (
              <DropdownMenuItem key={s ?? "new"} aria-current={s === props.status || undefined} onSelect={() => pick(s)}>
                <Icon className={cn("size-4", text)} aria-hidden />
                {s === null ? "Clear (New)" : trackLabel(s)}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs}
    </>
  );
}

/** Detail page: every status as a tile, the current one highlighted; one click picks it. */
export function TrackStatusBoard(props: TrackStatusProps) {
  const { pick, pending, dialogs } = useTrackPick(props);
  return (
    <div role="group" aria-label="Renewal status" className="flex flex-wrap gap-2">
      {TRACK_OPTIONS.map((s) => {
        const { icon, text, tile } = TRACK_LOOK[s ?? "new"];
        return (
          <StatusTileButton
            key={s ?? "new"}
            icon={icon}
            text={text}
            tile={tile}
            label={trackLabel(s)}
            current={s === props.status}
            disabled={pending}
            onClick={() => pick(s)}
          />
        );
      })}
      {dialogs}
    </div>
  );
}
