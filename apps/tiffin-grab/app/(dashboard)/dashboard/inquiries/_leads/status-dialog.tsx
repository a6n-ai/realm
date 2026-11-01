"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
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
  BadgeCheckIcon, CalendarClockIcon, ChevronDownIcon, CreditCardIcon, MapPinOffIcon, MessageSquareReplyIcon,
  PhoneMissedIcon, RepeatIcon, SparklesIcon, ThumbsUpIcon, UtensilsIcon, XCircleIcon, type LucideIcon,
} from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { Badge } from "@/components/reui/badge";
import { DateInput } from "@/components/dashboard/date-fields";
import {
  SUB_STATUSES, SUB_STATUS_META, groupFor, isClosed, statusLabel,
  type StatusGroup, type SubStatus,
} from "@/lib/inquiries/status";
import type { LostReason } from "@/lib/services/inquiries.service";
import { addNote, logActivity, updateStatus } from "../actions";
import { followUpAtDate, followUpPick } from "./follow-up-picks";

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

export function StatusIcon({ subStatus, className }: { subStatus: SubStatus | null; className?: string }) {
  const { icon: Icon, text } = look(subStatus);
  return <Icon className={cn("size-4 shrink-0", text, className)} aria-hidden />;
}

export function StatusPill({ subStatus }: { subStatus: SubStatus | null }) {
  const { icon: Icon, pill } = look(subStatus);
  return (
    // max-w-full + truncate: a long label (e.g. "Will take in future") ellipsizes inside its column instead of widening it.
    <Badge variant="outline" size="lg" className={cn("max-w-full border-transparent", pill)} title={statusLabel(subStatus)}>
      <Icon className="size-3.5" aria-hidden />
      <span className="truncate">{statusLabel(subStatus)}</span>
    </Badge>
  );
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
  const router = useRouter();
  const [pending, start] = useTransition();

  function pick(to: SubStatus | null, extra?: { lostReason?: LostReason; note?: string }) {
    if (to === subStatus) return;
    start(async () => {
      try {
        const { previous } = await updateStatus(inquiryId, { subStatus: to, ...extra });
        setLostOpen(false);
        router.refresh();
        const canUndo = previous !== null && !isClosed(previous) && !isClosed(to);
        toast(`Status: ${statusLabel(to)}`, {
          action: canUndo
            ? {
                label: "Undo",
                onClick: () => start(async () => {
                  try { await updateStatus(inquiryId, { subStatus: previous }); router.refresh(); }
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
  const lostDialog = (
    <LostDialog open={lostOpen} onOpenChange={setLostOpen} pending={pending} onSave={(lostReason, note) => pick("lost", { lostReason, note })} />
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
                {SUB_STATUSES.filter((s) => SUB_STATUS_META[s].pickable && !SUB_STATUS_META[s].closes && groupFor(s) === group).map((s) => (
                  <StatusTile key={s} sub={s} current={s === subStatus} onSelect={() => pick(s)} />
                ))}
              </TileRow>
            ))}
            <TileRow label="Close lead">
              <StatusTile sub="undeliverable" onSelect={() => pick("undeliverable")} />
              <StatusTile sub="lost" label="Lost…" onSelect={openLost} />
            </TileRow>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
    {lostDialog}
    </>
  );
}

/** Detail page: every status visible as tiles, current one highlighted; one click saves. */
export function StatusBoard({ inquiryId, subStatus }: { inquiryId: string; subStatus: SubStatus | null }) {
  const { pick, pending, openLost, lostDialog } = useStatusPick(inquiryId, subStatus);
  const took = subStatus === "took_plan" || subStatus === "took_trial";
  const closed = isClosed(subStatus);
  const groups: { label: string; items: { sub: SubStatus | null; label?: string; onClick: () => void }[] }[] = took
    ? []
    : closed
      ? [{ label: "Reopen", items: [{ sub: null, label: "Reopen as New", onClick: () => pick(null) }] }]
      : [
          ...MENU_GROUPS.map(({ group, label }) => ({
            label,
            items: SUB_STATUSES.filter((s) => SUB_STATUS_META[s].pickable && !SUB_STATUS_META[s].closes && groupFor(s) === group)
              .map((s) => ({ sub: s, onClick: () => pick(s) })),
          })),
          {
            label: "Close lead",
            items: [
              { sub: "undeliverable" as const, onClick: () => pick("undeliverable") },
              { sub: "lost" as const, label: "Lost…", onClick: openLost },
            ],
          },
        ];
  if (took) return <StatusPill subStatus={subStatus} />;
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      {groups.map((g) => (
        <div key={g.label} className="flex flex-col gap-1.5">
          <span className="text-muted-foreground text-xs font-medium">{g.label}</span>
          <div className="flex gap-1">
            {g.items.map(({ sub, label, onClick }) => {
              const { icon: Icon, text, tile } = look(sub);
              const current = sub === subStatus;
              return (
                <button
                  key={sub ?? "new"}
                  type="button"
                  disabled={pending}
                  aria-pressed={current}
                  onClick={() => (current ? undefined : onClick())}
                  className={cn(
                    "flex w-20 flex-col items-center gap-1.5 rounded-lg border p-1.5 text-center outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                    current ? "border-primary bg-accent" : "border-transparent hover:bg-muted",
                  )}
                >
                  <span className={cn("grid size-10 place-items-center rounded-lg", tile)}>
                    <Icon className={cn("size-5", text)} aria-hidden />
                  </span>
                  <span className="text-xs leading-tight">{label ?? statusLabel(sub)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {lostDialog}
    </div>
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
  const [reason, setReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Why was this lead lost?</DialogTitle>
          <DialogDescription>The lead closes. You can reopen it later.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {LOST_REASONS.map((r) => (
            <Button key={r.value} type="button" size="sm" variant={reason === r.value ? "default" : "outline"} onClick={() => setReason(r.value)}>
              {r.label}
            </Button>
          ))}
        </div>
        <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="destructive" disabled={pending || reason === ""} onClick={() => reason && onSave(reason, note.trim() || undefined)}>Mark lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type PickKey = "tomorrow" | "3d" | "1w" | "date";
const PICKS: { key: Exclude<PickKey, "date">; label: string }[] = [
  { key: "tomorrow", label: "Tomorrow" },
  { key: "3d", label: "3 days" },
  { key: "1w", label: "1 week" },
];

export function FollowUpPicker({
  timeZone, value, onChange,
}: {
  timeZone: string;
  value: { key: PickKey; at: number; iso?: string } | null;
  onChange: (v: { key: PickKey; at: number; iso?: string } | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Next follow-up</span>
      <div className="flex flex-wrap items-center gap-2">
        {PICKS.map((p) => (
          <Button
            key={p.key}
            type="button"
            size="sm"
            variant={value?.key === p.key ? "default" : "outline"}
            onClick={() => onChange(value?.key === p.key ? null : { key: p.key, at: followUpPick(p.key, Date.now(), timeZone) })}
          >
            {p.label}
          </Button>
        ))}
        <DateInput
          value={value?.key === "date" ? (value.iso ?? "") : ""}
          onChange={(iso) => onChange({ key: "date", iso, at: followUpAtDate(iso, timeZone) })}
          placeholder="Pick date"
          aria-label="Pick follow-up date"
        />
      </div>
    </div>
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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<{ key: PickKey; at: number; iso?: string } | null>(null);
  function save() {
    start(async () => {
      try {
        const text = note.trim();
        if (kind === "note") await addNote(inquiryId, text, followUp?.at);
        // A follow-up on its own is a scheduled callback in the timeline.
        else await logActivity(inquiryId, { type: kind === "follow_up" ? "callback" : kind, note: text || undefined, nextFollowUpAt: followUp?.at });
        onOpenChange(false);
        setNote("");
        setFollowUp(null);
        router.refresh();
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
          <Button disabled={pending || (kind === "note" && note.trim() === "") || (kind === "follow_up" && followUp === null)} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
