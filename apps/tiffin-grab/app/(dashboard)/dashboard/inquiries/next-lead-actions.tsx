"use client";
import { useState } from "react";
import { CalendarClockIcon, MessageSquarePlusIcon, PhoneCallIcon } from "lucide-react";
import { RowActionTooltipButton } from "@/components/ds";
import { NoteDialog, type NoteKind } from "./_leads/status-dialog";

const ICON_ACTIONS = {
  call: { label: "Log outcome", icon: PhoneCallIcon, tone: "text-emerald-600 dark:text-emerald-400" },
  note: { label: "Add note", icon: MessageSquarePlusIcon, tone: "text-violet-600 dark:text-violet-400" },
  follow_up: { label: "Set follow-up", icon: CalendarClockIcon, tone: "text-teal-600 dark:text-teal-400" },
} satisfies Record<string, { label: string; icon: typeof PhoneCallIcon; tone: string }>;

/** Icon-only action on a recommended lead; opens the existing note dialog for its kind. */
export function NextLeadIconAction({ inquiryId, timeZone, kind }: { inquiryId: string; timeZone: string; kind: keyof typeof ICON_ACTIONS }) {
  const [open, setOpen] = useState(false);
  const { label, icon, tone } = ICON_ACTIONS[kind];
  const noteKind: NoteKind = kind;
  return (
    <>
      <RowActionTooltipButton icon={icon} label={label} tone={tone} onClick={() => setOpen(true)} />
      {open && <NoteDialog inquiryId={inquiryId} timeZone={timeZone} kind={noteKind} open onOpenChange={setOpen} />}
    </>
  );
}
