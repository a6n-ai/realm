"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
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
  CLOSE_OPTIONS, SUB_STATUSES, SUB_STATUS_META, groupFor, isClosed, statusLabel,
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

type Tone = "info" | "primary" | "warning" | "success" | "destructive";

// One icon + colour per status so a column of pills reads at a glance.
const LOOK: Record<SubStatus | "new", { icon: LucideIcon; tone: Tone }> = {
  new: { icon: SparklesIcon, tone: "info" },
  no_response: { icon: PhoneMissedIcon, tone: "warning" },
  responded: { icon: MessageSquareReplyIcon, tone: "primary" },
  future: { icon: CalendarClockIcon, tone: "info" },
  persistent: { icon: RepeatIcon, tone: "primary" },
  expected: { icon: ThumbsUpIcon, tone: "success" },
  pending_payment: { icon: CreditCardIcon, tone: "warning" },
  took_plan: { icon: BadgeCheckIcon, tone: "success" },
  took_trial: { icon: UtensilsIcon, tone: "success" },
  lost: { icon: XCircleIcon, tone: "destructive" },
  undeliverable: { icon: MapPinOffIcon, tone: "destructive" },
};

const TONE_TEXT: Record<Tone, string> = {
  info: "text-sky-600 dark:text-sky-400",
  primary: "text-primary",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  destructive: "text-destructive",
};

const look = (sub: SubStatus | null) => LOOK[sub ?? "new"];

const TONE_BG: Record<Tone, string> = {
  info: "bg-sky-500/12",
  primary: "bg-primary/12",
  warning: "bg-amber-500/14",
  success: "bg-emerald-500/14",
  destructive: "bg-destructive/12",
};

export function StatusIcon({ subStatus, className }: { subStatus: SubStatus | null; className?: string }) {
  const { icon: Icon, tone } = look(subStatus);
  return <Icon className={cn("size-4 shrink-0", TONE_TEXT[tone], className)} aria-hidden />;
}

export function StatusPill({ subStatus }: { subStatus: SubStatus | null }) {
  const { icon: Icon, tone } = look(subStatus);
  return (
    <Badge variant={`${tone}-light`} size="lg">
      <Icon className="size-3.5" aria-hidden />
      {statusLabel(subStatus)}
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
  const { icon: Icon, tone } = look(sub);
  return (
    <DropdownMenuItem
      onSelect={onSelect}
      aria-current={current || undefined}
      className={cn("flex w-20 flex-col items-center gap-1.5 text-center", current && "bg-accent")}
    >
      <span className={cn("grid size-10 place-items-center rounded-lg", TONE_BG[tone])}>
        <Icon className={cn("size-5", TONE_TEXT[tone])} aria-hidden />
      </span>
      <span className="text-xs leading-tight">{label ?? statusLabel(sub)}</span>
    </DropdownMenuItem>
  );
}

const MENU_GROUPS: { group: StatusGroup; label: string }[] = [
  { group: "lead", label: "Lead" },
  { group: "follow_up", label: "Follow-up" },
];

/**
 * Click the pill → pick status + sub-status in one menu. Lost needs a reason and
 * notes/follow-up dates need fields, so those route to the full StatusDialog via onMore.
 */
export function StatusMenu({
  inquiryId, subStatus, onMore,
}: {
  inquiryId: string;
  subStatus: SubStatus | null;
  onMore: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const took = subStatus === "took_plan" || subStatus === "took_trial";
  const closed = isClosed(subStatus);

  function pick(to: SubStatus | null) {
    if (to === subStatus) return;
    start(async () => {
      try {
        const { previous } = await updateStatus(inquiryId, { subStatus: to });
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

  const trigger = (
    <button type="button" aria-label="Change status" disabled={pending} className="inline-flex cursor-pointer items-center gap-1 disabled:opacity-60" onClick={(e) => e.stopPropagation()}>
      <StatusPill subStatus={subStatus} />
      {took ? null : <ChevronDownIcon className="text-muted-foreground size-3.5" />}
    </button>
  );
  if (took) return <StatusPill subStatus={subStatus} />;

  return (
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
              <StatusTile sub="lost" label="Lost…" onSelect={onMore} />
            </TileRow>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
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

export function StatusDialog({
  inquiryId, subStatus, timeZone, onConvert, trigger, open: openProp, onOpenChange,
}: {
  inquiryId: string;
  subStatus: SubStatus | null;
  timeZone: string;
  onConvert?: () => void;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (v: boolean) => { setInnerOpen(v); onOpenChange?.(v); };
  const took = subStatus === "took_plan" || subStatus === "took_trial";
  const closed = isClosed(subStatus) && !took;
  const [group, setGroup] = useState<StatusGroup>(groupFor(subStatus));
  const [chosen, setChosen] = useState<SubStatus | null>(subStatus && !isClosed(subStatus) ? subStatus : null);
  const [reason, setReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<{ key: PickKey; at: number; iso?: string } | null>(null);

  const closing = chosen !== null && isClosed(chosen);
  const pills = SUB_STATUSES.filter((s) => SUB_STATUS_META[s].pickable && !SUB_STATUS_META[s].closes && groupFor(s) === group);
  const changed = chosen !== subStatus || note.trim() !== "" || followUp !== null;
  const canSave = chosen !== null && changed && (chosen !== "lost" || reason !== "");

  function run(to: SubStatus | null, extra: { note?: string; nextFollowUpAt?: number; lostReason?: LostReason }) {
    start(async () => {
      try {
        const { previous } = await updateStatus(inquiryId, { subStatus: to, ...extra });
        setOpen(false);
        setNote("");
        setFollowUp(null);
        router.refresh();
        if (previous !== to) {
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
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update status");
      }
    });
  }

  function save() {
    run(chosen, {
      note: note.trim() || undefined,
      nextFollowUpAt: closing ? undefined : followUp?.at,
      lostReason: chosen === "lost" && reason ? reason : undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="flex flex-col gap-4 sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Update status</DialogTitle>
          <DialogDescription>Currently {statusLabel(subStatus)}.</DialogDescription>
        </DialogHeader>
        {took ? (
          <p className="text-muted-foreground text-sm">This inquiry became an order, so its status is final.</p>
        ) : closed ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">This inquiry is closed as <span className="font-medium">{statusLabel(subStatus)}</span>.</p>
            <Button disabled={pending} onClick={() => run(null, {})}>Reopen as New</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              {(["lead", "follow_up"] as const).map((g) => (
                <Button
                  key={g}
                  type="button"
                  size="sm"
                  variant={group === g ? "default" : "outline"}
                  onClick={() => { setGroup(g); if (chosen && !isClosed(chosen) && groupFor(chosen) !== g) setChosen(null); }}
                >
                  {g === "lead" ? "Lead" : "Follow-up"}
                </Button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {pills.map((s) => (
                <Button key={s} type="button" size="sm" variant={chosen === s ? "default" : "outline"} onClick={() => setChosen(s)}>
                  {SUB_STATUS_META[s].label}
                </Button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-muted-foreground text-xs">Close lead</span>
              <div className="flex flex-wrap items-center gap-2">
                {CLOSE_OPTIONS.map((s) => (
                  <Button key={s} type="button" size="sm" variant={chosen === s ? "destructive" : "outline"} onClick={() => setChosen(s)}>
                    {SUB_STATUS_META[s].label}
                  </Button>
                ))}
              </div>
            </div>
            {chosen === "lost" ? (
              <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
                <SelectTrigger className="w-full" aria-label="Lost reason"><SelectValue placeholder="Reason lost" /></SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : null}
            <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            {closing ? null : <FollowUpPicker timeZone={timeZone} value={followUp} onChange={setFollowUp} />}
            <div className="flex items-center justify-between gap-2">
              {group === "follow_up" ? (
                onConvert ? (
                  <Button type="button" variant="outline" onClick={() => { setOpen(false); onConvert(); }}>Convert to order</Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link href={`/dashboard/inquiries/${inquiryId}?convert=1`}>Convert to order</Link>
                  </Button>
                )
              ) : <span />}
              <Button disabled={!canSave || pending} onClick={save}>Save</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type NoteKind = "note" | "call" | "whatsapp" | "follow_up";
const NOTE_TITLE: Record<NoteKind, string> = { note: "Add note", call: "Log call", whatsapp: "Log WhatsApp", follow_up: "Set follow-up" };

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
