"use client";

import {
  ArrowRightIcon, CalendarClockIcon, CreditCardIcon, FileTextIcon, MailIcon, MapPinIcon, MessageCircleIcon, PackageIcon,
  MergeIcon, PhoneIcon, RepeatIcon, ShoppingBagIcon, SparklesIcon, StickyNoteIcon, TriangleAlertIcon, UserRoundIcon, type LucideIcon,
} from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { stageLabel } from "@/components/ds";
import { statusLabel, type SubStatus } from "@/lib/inquiries/status";
import { ActivityTimeline, type ActivityFilter } from "@/components/dashboard/pipeline/activity-timeline";
import { look } from "../_leads/status-dialog";
import { roundLabel } from "@/lib/inquiries/display";
import { trackLabel, type TrackStatus } from "@/lib/renewals/status";

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
  /** The order's rank among the customer's orders: 1 or null is the first sale, 2+ a renewal round. */
  orderRank: number | null;
  details: Record<string, unknown> | null;
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
  renewal_started: { icon: RepeatIcon, tone: "text-sky-600 dark:text-sky-400" },
  renewed: { icon: ShoppingBagIcon, tone: "text-primary" },
  reminder_sent: { icon: MailIcon, tone: "text-indigo-600 dark:text-indigo-400" },
  reassigned: { icon: UserRoundIcon, tone: "text-muted-foreground" },
  merged: { icon: MergeIcon, tone: "text-muted-foreground" },
  match_conflict: { icon: TriangleAlertIcon, tone: "text-amber-600 dark:text-amber-400" },
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
      if (a.details && "renewalStatusTo" in a.details) {
        const track = (v: unknown) => trackLabel((v ?? null) as TrackStatus | null);
        return `Renewal: ${track(a.details.renewalStatusFrom)} → ${track(a.details.renewalStatusTo)}`;
      }
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
      return `Quote sent${a.amount != null ? ` — ${formatMoney(a.amount / 100, currency)}` : ""}`;
    case "payment_link_sent":
      return `Payment link sent${a.amount != null ? ` — ${formatMoney(a.amount / 100, currency)}` : ""}`;
    case "sample_sent":
      return "Sample sent";
    case "visit":
      return "Site visit";
    case "callback":
      return "Follow-up scheduled";
    case "renewal_started":
      return "Renewal round opened";
    case "renewed":
      return "Renewed with a new plan";
    case "reminder_sent":
      return "Renewal reminder sent";
    case "reassigned":
      return "Owner changed";
    case "merged":
      return "Merged duplicate inquiries";
    case "match_conflict":
      return a.note ?? "Contact matches another inquiry";
    case "reinquiry":
      // First line: "Re-inquiry via <source> · <different contact>"; the rest is their message.
      return a.note?.split("\n")[0] ?? "Re-inquiry";
    default:
      return a.note ?? "";
  }
}

/** The activity title, suffixed with its renewal round so a reused row reads per round. */
export function titleFor(a: TimelineActivity, currency: string): string {
  const title = describe(a, currency);
  return a.orderRank != null && a.orderRank > 1 ? `${title} · ${roundLabel(a.orderRank)}` : title;
}

const FILTERS: ActivityFilter[] = [
  { key: "all", label: "All", types: null },
  { key: "note", label: "Notes", types: ["note"] },
  { key: "calls", label: "Calls", types: ["call", "whatsapp", "email", "visit"] },
  { key: "status", label: "Status", types: ["stage_change", "converted", "renewal_started", "renewed"] },
];

export function InquiryTimeline({
  activities, currency, onAddNote, now,
}: {
  activities: TimelineActivity[];
  currency: string;
  onAddNote: () => void;
  now: number;
}) {
  return (
    <ActivityTimeline
      now={now}
      items={activities.map((a) => {
        const { icon, tone } = nodeFor(a);
        const body = a.type === "reinquiry" ? (a.note?.includes("\n") ? a.note.slice(a.note.indexOf("\n") + 1) : null) : a.note;
        return {
          id: a.publicId,
          type: a.type,
          icon,
          tone,
          title: titleFor(a, currency),
          note: body,
          outcome: a.outcome,
          nextFollowUpAt: a.nextFollowUpAt,
          createdAt: a.createdAt,
          actor: a.actor,
          system: a.type === "created" || (a.type === "stage_change" && !a.note),
        };
      })}
      filters={FILTERS}
      onAddNote={onAddNote}
      grouped
    />
  );
}
