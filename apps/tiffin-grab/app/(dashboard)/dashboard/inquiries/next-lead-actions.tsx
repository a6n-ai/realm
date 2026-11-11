"use client";
import { useState } from "react";
import { CalendarClockIcon, MessageSquarePlusIcon, PhoneCallIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { RowActionTooltipButton } from "@/components/ds";
import { NoteDialog, type NoteKind } from "./_leads/status-dialog";

const ICON_ACTIONS = {
  note: { label: "Add note", icon: MessageSquarePlusIcon, tone: "text-violet-600 dark:text-violet-400" },
  follow_up: { label: "Set follow-up", icon: CalendarClockIcon, tone: "text-teal-600 dark:text-teal-400" },
} as const;

/** Icon-only secondary action on the Next lead card; opens the existing note dialog for its kind. */
export function NextLeadIconAction({ inquiryId, timeZone, kind }: { inquiryId: string; timeZone: string; kind: keyof typeof ICON_ACTIONS }) {
  const [open, setOpen] = useState(false);
  const { label, icon, tone } = ICON_ACTIONS[kind];
  return (
    <>
      <RowActionTooltipButton icon={icon} label={label} tone={tone} onClick={() => setOpen(true)} />
      {open && <NoteDialog inquiryId={inquiryId} timeZone={timeZone} kind={kind} open onOpenChange={setOpen} />}
    </>
  );
}

/** The card's one primary action: logs a call outcome through the same note dialog. */
export function NextLeadLogOutcome({ inquiryId, timeZone }: { inquiryId: string; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const kind: NoteKind = "call";
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <PhoneCallIcon className="size-4" />
        Log outcome
      </Button>
      {open && <NoteDialog inquiryId={inquiryId} timeZone={timeZone} kind={kind} open onOpenChange={setOpen} />}
    </>
  );
}
