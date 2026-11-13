"use client";

import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from "@foundry/ui/dropdown-menu";
import {
  ArrowRightIcon, BadgeCheckIcon, CalendarClockIcon, ChevronDownIcon, CreditCardIcon, Loader2Icon, MapPinOffIcon, MessageSquareReplyIcon,
  PhoneMissedIcon, RepeatIcon, SparklesIcon, ThumbsUpIcon, UtensilsIcon, XCircleIcon, type LucideIcon,
} from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { FollowUpPicker, type FollowUpValue } from "@/components/dashboard/pipeline/follow-up-picker";
import { ReasonDialog } from "@/components/dashboard/pipeline/reason-dialog";
import { TonePill } from "@/components/dashboard/pipeline/status-tile";
import {
  SUB_STATUSES, groupFor, isClosed, isOpenPickable, statusLabel,
  type StatusGroup, type SubStatus,
} from "@/lib/inquiries/status";
import type { LostReason } from "@/lib/services/inquiries.service";
import { addNote, logActivity, updateStatus } from "../actions";
import { unwrapAction } from "@/lib/actions/unwrap";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { useCardRefresh } from "@/components/dashboard/next-item/recommendation-card";

const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "out_of_zone", label: "Out of zone" },
  { value: "no_response", label: "No response" },
  { value: "chose_competitor", label: "Chose competitor" },
  { value: "not_ready", label: "Not ready" },
  { value: "other", label: "Other" },
  { value: "asked_to_stop", label: "Asked to stop" },
];

// Every status gets its own icon and colour (categorical, so raw palette with dark pairs).
// Violet and teal are taken by the row quick actions.
type Look = { icon: LucideIcon; pill: string; text: string; tile: string };
const LOOK: Record<SubStatus | "new", Look> = {
  new: { icon: SparklesIcon, pill: "bg-sky-500/12 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300", text: "text-sky-600 dark:text-sky-400", tile: "bg-sky-500/12 dark:bg-sky-400/15" },
  no_response: { icon: PhoneMissedIcon, pill: "bg-orange-500/12 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300", text: "text-orange-600 dark:text-orange-400", tile: "bg-orange-500/12 dark:bg-orange-400/15" },
  responded: { icon: MessageSquareReplyIcon, pill: "bg-blue-500/12 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300", text: "text-blue-600 dark:text-blue-400", tile: "bg-blue-500/12 dark:bg-blue-400/15" },
  future: { icon: CalendarClockIcon, pill: "bg-indigo-500/12 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300", text: "text-indigo-600 dark:text-indigo-400", tile: "bg-indigo-500/12 dark:bg-indigo-400/15" },
  persistent: { icon: RepeatIcon, pill: "bg-cyan-500/12 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300", text: "text-cyan-600 dark:text-cyan-400", tile: "bg-cyan-500/12 dark:bg-cyan-400/15" },
  expected: { icon: ThumbsUpIcon, pill: "bg-lime-500/14 text-lime-700 dark:bg-lime-400/15 dark:text-lime-300", text: "text-lime-600 dark:text-lime-400", tile: "bg-lime-500/14 dark:bg-lime-400/15" },
  pending_payment: { icon: CreditCardIcon, pill: "bg-amber-500/14 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300", text: "text-amber-600 dark:text-amber-400", tile: "bg-amber-500/14 dark:bg-amber-400/15" },
  took_plan: { icon: BadgeCheckIcon, pill: "bg-emerald-500/14 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300", text: "text-emerald-600 dark:text-emerald-400", tile: "bg-emerald-500/14 dark:bg-emerald-400/15" },
  took_trial: { icon: UtensilsIcon, pill: "bg-green-500/14 text-green-700 dark:bg-green-400/15 dark:text-green-300", text: "text-green-600 dark:text-green-400", tile: "bg-green-500/14 dark:bg-green-400/15" },
  lost: { icon: XCircleIcon, pill: "bg-red-500/12 text-red-700 dark:bg-red-400/15 dark:text-red-300", text: "text-red-600 dark:text-red-400", tile: "bg-red-500/12 dark:bg-red-400/15" },
  undeliverable: { icon: MapPinOffIcon, pill: "bg-pink-500/12 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300", text: "text-pink-600 dark:text-pink-400", tile: "bg-pink-500/12 dark:bg-pink-400/15" },
};

export const look = (sub: SubStatus | null) => LOOK[sub ?? "new"];

export function StatusPill({ subStatus }: { subStatus: SubStatus | null }) {
  const { icon, pill } = look(subStatus);
  return <TonePill icon={icon} pill={pill} label={statusLabel(subStatus)} />;
}

function TileRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      <div className="flex gap-1">{children}</div>
    </DropdownMenuGroup>
  );
}

// One tile per status: big tinted icon over its name, so the row scans like a toolbar.
function StatusTile({
  sub, label, current, onSelect,
}: {
  sub: SubStatus | null;
  label?: string;
  current?: boolean;
  onSelect: () => void;
}) {
  const { icon: Icon, text, tile } = look(sub);
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      aria-current={current || undefined}
      className={cn("flex w-20 flex-col items-center gap-1.5 text-center", current && "bg-accent")}
    >
      <span className={cn("grid size-10 place-items-center rounded-lg", tile)}>
        <Icon className={cn("size-5", text)} aria-hidden />
      </span>
      <span className="text-xs leading-tight">{label ?? statusLabel(sub)}</span>
    </DropdownMenuItem>
  );
}

/** Controlled tile row for choosing a status inline (null = New). */
export function StatusTilePicker({
  value, onChange, options, label,
}: {
  value: SubStatus | null;
  onChange: (v: SubStatus | null) => void;
  options: (SubStatus | null)[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-2 sm:grid-cols-7">
      {options.map((sub) => {
        const { icon: Icon, text, tile } = look(sub);
        const active = sub === value;
        return (
          <button
            key={sub ?? "new"}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(sub)}
            className={cn(
              "flex flex-col items-center gap-1.5 rounded-lg border p-1.5 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              active ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
            )}
          >
            <span className={cn("grid size-8 place-items-center rounded-lg", tile)}>
              <Icon className={cn("size-4", text)} aria-hidden />
            </span>
            <span className="text-xs leading-tight">{statusLabel(sub)}</span>
          </button>
        );
      })}
    </div>
  );
}

const MENU_GROUPS: { group: StatusGroup; label: string }[] = [
  { group: "lead", label: "Lead" },
  { group: "follow_up", label: "Follow-up" },
];

/**
 * Click the pill → pick status + sub-status in one menu; the pick saves at once.
 * Only Lost asks for more, and only for its reason — never the status again.
 */
// Shared by the pill menu and the inline board: save the pick, toast with Undo, Lost via its reason dialog.
function useStatusPick(inquiryId: string, subStatus: SubStatus | null) {
  const [lostOpen, setLostOpen] = useState(false);
  // A tile click picks the target; this small dialog only adds an optional note + follow-up, never the status again.
  const [target, setTarget] = useState<{ to: SubStatus | null } | null>(null);
  const { refresh } = useCardRefresh();
  const [pending, start] = useTransition();

  function save(to: SubStatus | null, extra?: { lostReason?: LostReason; note?: string; nextFollowUpAt?: number }) {
    start(async () => {
      try {
        const { previous } = await unwrapAction(updateStatus(inquiryId, { subStatus: to, ...extra }));
        setLostOpen(false);
        setTarget(null);
        refresh();
        if (previous === to) { toast("Saved"); return; }
        const canUndo = previous !== null && !isClosed(previous) && !isClosed(to);
        toast(`Status: ${statusLabel(to)}`, {
          action: canUndo
            ? {
                label: "Undo",
                onClick: () => start(async () => {
                  try { await unwrapAction(updateStatus(inquiryId, { subStatus: previous })); refresh(); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Could not undo"); }
                }),
              }
            : undefined,
        });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update status");
      }
    });
  }
  function pick(to: SubStatus | null) {
    // Re-picking the current status is allowed: it logs a note / follow-up against it.
    setTarget({ to });
  }
  const lostDialog = (
    <>
      <LostDialog open={lostOpen} onOpenChange={setLostOpen} pending={pending} onSave={(lostReason, note) => save("lost", { lostReason, note })} />
      {target ? (
        <ChangeStatusDialog
          key={target.to ?? "new"}
          from={subStatus}
          to={target.to}
          pending={pending}
          onOpenChange={(o) => { if (!o) setTarget(null); }}
          onSave={(note, nextFollowUpAt) => save(target.to, { note, nextFollowUpAt })}
        />
      ) : null}
    </>
  );
  return { pick, pending, openLost: () => setLostOpen(true), lostDialog };
}

export function StatusMenu({ inquiryId, subStatus }: { inquiryId: string; subStatus: SubStatus | null }) {
  const { pick, pending, openLost, lostDialog } = useStatusPick(inquiryId, subStatus);
  const took = subStatus === "took_plan" || subStatus === "took_trial";
  const closed = isClosed(subStatus);

  const trigger = (
    <button type="button" aria-label="Change status" disabled={pending} className="inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 disabled:opacity-60" onClick={(e) => e.stopPropagation()}>
      <StatusPill subStatus={subStatus} />
      {took ? null : <ChevronDownIcon className="text-muted-foreground size-3.5 shrink-0" />}
    </button>
  );
  if (took) return <StatusPill subStatus={subStatus} />;

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto" onClick={(e) => e.stopPropagation()}>
        {closed ? (
          <TileRow label="Reopen">
            <StatusTile sub={null} label="Reopen as New" onSelect={() => pick(null)} />
          </TileRow>
        ) : (
          <>
            {MENU_GROUPS.map(({ group, label }) => (
              <TileRow key={group} label={label}>
                {SUB_STATUSES.filter((s) => isOpenPickable(s) && groupFor(s) === group).map((s) => (
                  <StatusTile key={s} sub={s} current={s === subStatus} onSelect={() => pick(s)} />
                ))}
              </TileRow>
            ))}
            <TileRow label="Close lead">
              <StatusTile sub="undeliverable" onSelect={() => pick("undeliverable")} />
              <StatusTile sub="lost" label="Lost" onSelect={openLost} />
            </TileRow>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {lostDialog}
    </>
  );
}

function BigStatus({ label, subStatus }: { label: string; subStatus: SubStatus | null }) {
  const { icon: Icon, text, tile } = look(subStatus);
  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-xl", tile)}>
        <Icon className={cn("size-6", text)} aria-hidden />
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-muted-foreground text-xs">{label}</span>
        <span className="text-sm font-medium">{statusLabel(subStatus)}</span>
      </div>
    </div>
  );
}

function ChangeStatusDialog({
  from, to, pending, onOpenChange, onSave,
}: {
  from: SubStatus | null;
  to: SubStatus | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (note?: string, nextFollowUpAt?: number) => void;
}) {
  const tz = useTimezone();
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpValue | null>(null);
  const closing = isClosed(to);
  const submit = () => onSave(note.trim() || undefined, closing ? undefined : followUp?.at);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{from === to ? "Update status" : "Change status"}</DialogTitle>
          <DialogDescription>Note and follow-up are optional. Save to apply.</DialogDescription>
        </DialogHeader>
        {/* Where the lead is now and where it is moving, so staff confirm the right move. */}
        <div className="bg-muted/40 flex flex-wrap items-center gap-4 rounded-lg border p-3">
          <BigStatus label="Current" subStatus={from} />
          {from === to ? null : (
            <>
              <ArrowRightIcon className="text-muted-foreground size-5" aria-hidden />
              <BigStatus label="Moving to" subStatus={to} />
            </>
          )}
        </div>
        <Textarea
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
        />
        {closing ? null : <FollowUpPicker timeZone={tz} value={followUp} onChange={setFollowUp} />}
        <DialogFooter>
          <Button autoFocus disabled={pending} onClick={submit}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LostDialog({
  open, onOpenChange, pending, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSave: (reason: LostReason, note?: string) => void;
}) {
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      pending={pending}
      title="Lost reason"
      confirmLabel="Mark lost"
      reasons={LOST_REASONS}
      onSave={onSave}
    />
  );
}

export type NoteKind = "note" | "call" | "whatsapp" | "follow_up" | "visit";
const NOTE_TITLE: Record<NoteKind, string> = { note: "Add note", call: "Log call", whatsapp: "Log WhatsApp", follow_up: "Set follow-up", visit: "Log visit" };

export function NoteDialog({
  inquiryId, timeZone, kind, open, onOpenChange,
}: {
  inquiryId: string;
  timeZone: string;
  kind: NoteKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { refresh } = useCardRefresh();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpValue | null>(null);
  function save() {
    start(async () => {
      try {
        const text = note.trim();
        if (kind === "note") await unwrapAction(addNote(inquiryId, text, followUp?.at));
        // A follow-up on its own is a scheduled callback in the timeline.
        else await unwrapAction(logActivity(inquiryId, { type: kind === "follow_up" ? "callback" : kind, note: text || undefined, nextFollowUpAt: followUp?.at }));
        onOpenChange(false);
        setNote("");
        setFollowUp(null);
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{NOTE_TITLE[kind]}</DialogTitle>
          <DialogDescription>Saved to the lead's activity timeline.</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder={kind === "note" ? "Add a note" : kind === "follow_up" ? "What to follow up on (optional)" : "Outcome or notes (optional)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <FollowUpPicker timeZone={timeZone} value={followUp} onChange={setFollowUp} />
        <DialogFooter>
          <Button disabled={pending || (kind === "note" && note.trim() === "") || (kind === "follow_up" && followUp === null)} onClick={save}>
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
