"use client";

import { ArrowRightIcon, BellRingIcon, CalendarClockIcon, MailIcon, MessageCircleIcon, PhoneIcon, StickyNoteIcon, type LucideIcon } from "lucide-react";
import { ActivityTimeline, type ActivityFilter } from "@/components/dashboard/pipeline/activity-timeline";
import { trackLabel } from "@/lib/renewals/status";
import type { TrackActivity } from "@/lib/services/renewal-tracking.service";
import { TRACK_LOOK } from "./track-status";

// Categorical colours (raw palette with dark pair), matching the inquiry timeline's note and follow-up nodes.
const NODE: Record<string, { icon: LucideIcon; tone: string }> = {
  note: { icon: StickyNoteIcon, tone: "text-violet-600 dark:text-violet-400" },
  call: { icon: PhoneIcon, tone: "text-blue-600 dark:text-blue-400" },
  whatsapp: { icon: MessageCircleIcon, tone: "text-green-600 dark:text-green-400" },
  email: { icon: MailIcon, tone: "text-indigo-600 dark:text-indigo-400" },
  callback: { icon: CalendarClockIcon, tone: "text-teal-600 dark:text-teal-400" },
  reminder_sent: { icon: BellRingIcon, tone: "text-amber-600 dark:text-amber-400" },
  status_change: { icon: ArrowRightIcon, tone: "text-muted-foreground" },
};

function nodeFor(a: TrackActivity): { icon: LucideIcon; tone: string } {
  if (a.type === "status_change") {
    const l = TRACK_LOOK[a.toStatus ?? "new"];
    return { icon: l.icon, tone: l.text };
  }
  return NODE[a.type] ?? NODE.note!;
}

function describe(a: TrackActivity): string {
  switch (a.type) {
    case "status_change":
      return `Status: ${trackLabel(a.fromStatus)} → ${trackLabel(a.toStatus)}`;
    case "reminder_sent":
      return "Renewal reminder sent";
    case "callback":
      return "Follow-up scheduled";
    case "call":
      return "Call";
    case "whatsapp":
      return "WhatsApp";
    case "email":
      return "Email";
    default:
      return "Note";
  }
}

const FILTERS: ActivityFilter[] = [
  { key: "all", label: "All", types: null },
  { key: "notes", label: "Notes", types: ["note", "call", "whatsapp", "email", "callback"] },
  { key: "status", label: "Status", types: ["status_change"] },
];

export function TrackTimeline({ activities, onAddNote, now }: { activities: TrackActivity[]; onAddNote: () => void; now: number }) {
  return (
    <ActivityTimeline
      now={now}
      items={activities.map((a) => {
        const { icon, tone } = nodeFor(a);
        return {
          id: a.publicId,
          type: a.type,
          icon,
          tone,
          title: describe(a),
          note: a.note,
          outcome: a.outcome,
          nextFollowUpAt: a.nextFollowUpAt,
          createdAt: a.createdAt,
          actor: a.actor,
        };
      })}
      filters={FILTERS}
      onAddNote={onAddNote}
    />
  );
}
