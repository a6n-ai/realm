"use client";

import { useState } from "react";
import {
  ArrowRightIcon, CalendarClockIcon, CreditCardIcon, FileTextIcon, MailIcon, MapPinIcon, MessageCircleIcon, PackageIcon,
  PhoneIcon, RepeatIcon, ScrollTextIcon, ShoppingBagIcon, SparklesIcon, StickyNoteIcon, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/reui/timeline";
import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";
import { formatMinor } from "@/lib/format/money";
import { stageLabel } from "@/components/ds";
import { statusLabel, type SubStatus } from "@/lib/inquiries/status";
import { look } from "../_leads/status-dialog";

export type TimelineActivity = {
  publicId: string;
  type: string;
  note: string | null;
  outcome: string | null;
  amount: number | null;
  nextFollowUpAt: number | null;
  fromStage: string | null;
  toStage: string | null;
  fromSubStatus: SubStatus | null;
  toSubStatus: SubStatus | null;
  createdAt: number;
  actor: { label: string; kind: "system" | "staff" | "customer" };
};

// Categorical colours (raw palette with dark pair). Violet and teal match the note / follow-up quick actions.
const NODE: Record<string, { icon: LucideIcon; tone: string }> = {
  created: { icon: SparklesIcon, tone: "text-sky-600 dark:text-sky-400" },
  reinquiry: { icon: RepeatIcon, tone: "text-amber-600 dark:text-amber-400" },
  call: { icon: PhoneIcon, tone: "text-blue-600 dark:text-blue-400" },
  whatsapp: { icon: MessageCircleIcon, tone: "text-green-600 dark:text-green-400" },
  email: { icon: MailIcon, tone: "text-indigo-600 dark:text-indigo-400" },
  note: { icon: StickyNoteIcon, tone: "text-violet-600 dark:text-violet-400" },
  callback: { icon: CalendarClockIcon, tone: "text-teal-600 dark:text-teal-400" },
  visit: { icon: MapPinIcon, tone: "text-rose-600 dark:text-rose-400" },
  quote_sent: { icon: FileTextIcon, tone: "text-orange-600 dark:text-orange-400" },
  sample_sent: { icon: PackageIcon, tone: "text-lime-600 dark:text-lime-400" },
  payment_link_sent: { icon: CreditCardIcon, tone: "text-emerald-600 dark:text-emerald-400" },
  converted: { icon: ShoppingBagIcon, tone: "text-primary" },
  stage_change: { icon: ArrowRightIcon, tone: "text-muted-foreground" },
};

function nodeFor(a: TimelineActivity): { icon: LucideIcon; tone: string } {
  if (a.type === "stage_change" && a.toSubStatus) {
    const l = look(a.toSubStatus);
    return { icon: l.icon, tone: l.text };
  }
  return NODE[a.type] ?? NODE.note!;
}

// Title line for an activity. `outcome` renders as its own chip, so it is not inlined here.
export function describe(a: TimelineActivity, currency: string): string {
  switch (a.type) {
    case "created":
      return "Inquiry created";
    case "converted":
      return "Converted to an order";
    case "stage_change":
      // Old rows only carry stages; any row written by the status model has a sub-status on at least one side.
      if (a.fromSubStatus || a.toSubStatus) return `Status: ${statusLabel(a.fromSubStatus)} → ${statusLabel(a.toSubStatus)}`;
      return `Stage: ${a.fromStage ? stageLabel(a.fromStage) : "—"} → ${a.toStage ? stageLabel(a.toStage) : "—"}`;
    case "call":
      return "Call";
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    case "note":
      return "Note";
    case "quote_sent":
      return `Quote sent${a.amount != null ? ` — ${formatMinor(a.amount, currency)}` : ""}`;
    case "payment_link_sent":
      return `Payment link sent${a.amount != null ? ` — ${formatMinor(a.amount, currency)}` : ""}`;
    case "sample_sent":
      return "Sample sent";
    case "visit":
      return "Site visit";
    case "callback":
      return "Follow-up scheduled";
    case "reinquiry":
      // First line: "Re-inquiry via <source> · <different contact>"; the rest is their message.
      return a.note?.split("\n")[0] ?? "Re-inquiry";
    default:
      return a.note ?? "";
  }
}

const FILTERS = [
  { key: "all", label: "All", types: null },
  { key: "note", label: "Notes", types: ["note"] },
  { key: "status", label: "Status", types: ["stage_change", "converted"] },
] as const;

export function InquiryTimeline({
  activities, currency, onAddNote,
}: {
  activities: TimelineActivity[];
  currency: string;
  onAddNote: () => void;
}) {
  const tz = useTimezone();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const types = FILTERS.find((f) => f.key === filter)!.types;
  const rows = (types ? activities.filter((a) => (types as readonly string[]).includes(a.type)) : activities)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);

  if (activities.length === 0) {
    return (
      <div className="text-muted-foreground grid place-items-center gap-3 py-10 text-sm">
        <span className="bg-muted grid size-12 place-items-center rounded-xl"><ScrollTextIcon className="size-6" /></span>
        No activity yet
        <Button size="sm" variant="outline" onClick={onAddNote}>Add note</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button key={f.key} type="button" size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nothing matches this filter.</p>
      ) : (
        <Timeline defaultValue={0}>
          {rows.map((a, i) => {
            const { icon: Icon, tone } = nodeFor(a);
            const body = a.type === "reinquiry" ? (a.note?.includes("\n") ? a.note.slice(a.note.indexOf("\n") + 1) : null) : a.note;
            return (
              <TimelineItem key={a.publicId} step={i + 1} className="group-data-[orientation=vertical]/timeline:ms-10">
                <TimelineHeader>
                  <TimelineSeparator className="bg-input! group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.75rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-7.5" />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <TimelineTitle className="text-sm">{describe(a, currency)}</TimelineTitle>
                    <TimelineDate className="mb-0 tabular-nums">{formatEpoch(a.createdAt, { mode: "datetime", timeZone: tz })}</TimelineDate>
                  </div>
                  <TimelineIndicator className="bg-card flex size-7 items-center justify-center border group-data-[orientation=vertical]/timeline:-left-7">
                    <Icon className={cn("size-3.5", tone)} />
                  </TimelineIndicator>
                </TimelineHeader>
                <TimelineContent>
                  <div className="flex flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={a.actor.kind === "system" ? "text-muted-foreground" : "text-foreground"}>{a.actor.label}</span>
                      {a.actor.kind === "system" ? null : (
                        <Badge variant={a.actor.kind === "staff" ? "secondary" : "outline"}>{a.actor.kind === "staff" ? "Staff" : "Customer"}</Badge>
                      )}
                    </p>
                    {body ? <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">{body}</p> : null}
                    {a.outcome || a.nextFollowUpAt != null ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {a.outcome ? <Badge variant="outline">{a.outcome}</Badge> : null}
                        {a.nextFollowUpAt != null ? (
                          <Badge variant="info-light">Follow-up {formatEpoch(a.nextFollowUpAt, { mode: "date", timeZone: tz })}</Badge>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </TimelineContent>
              </TimelineItem>
            );
          })}
        </Timeline>
      )}
    </div>
  );
}
