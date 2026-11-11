"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { FollowUpPicker, type FollowUpValue } from "@/components/dashboard/pipeline/follow-up-picker";
import { unwrapAction } from "@/lib/actions/unwrap";
import { addTrackNoteAction, logTrackActivityAction } from "../actions";

export type TrackNoteKind = "note" | "call" | "whatsapp" | "email" | "follow_up";

const TITLE: Record<TrackNoteKind, string> = {
  note: "Add note",
  call: "Log call",
  whatsapp: "Log WhatsApp",
  email: "Log email",
  follow_up: "Set follow-up",
};

export function TrackNoteDialog({
  orderPublicId, customerPublicId, kind, open, onOpenChange, closed = false,
}: {
  orderPublicId: string;
  customerPublicId: string;
  kind: TrackNoteKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A closed plan (renewed or not renewed) takes no follow-up; the service rejects one. */
  closed?: boolean;
}) {
  const tz = useTimezone();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [followUp, setFollowUp] = useState<FollowUpValue | null>(null);

  function save() {
    start(async () => {
      try {
        const text = note.trim();
        if (kind === "note") {
          await unwrapAction(addTrackNoteAction(orderPublicId, customerPublicId, text, followUp?.at));
        } else {
          // A follow-up on its own is a scheduled callback in the timeline.
          await unwrapAction(logTrackActivityAction(orderPublicId, customerPublicId, {
            type: kind === "follow_up" ? "callback" : kind,
            note: text || undefined,
            nextFollowUpAt: followUp?.at,
          }));
        }
        handleOpenChange(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setNote("");
      setFollowUp(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{TITLE[kind]}</DialogTitle>
          <DialogDescription>Saved to the renewal's activity timeline.</DialogDescription>
        </DialogHeader>
        <Textarea
          placeholder={kind === "note" ? "Add a note" : kind === "follow_up" ? "What to follow up on (optional)" : "Outcome or notes (optional)"}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {closed ? null : <FollowUpPicker timeZone={tz} value={followUp} onChange={setFollowUp} />}
        <DialogFooter>
          <Button
            disabled={pending || (kind === "note" && note.trim() === "") || (kind === "follow_up" && (closed || followUp === null))}
            onClick={save}
          >
            {pending && <Loader2Icon className="animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
