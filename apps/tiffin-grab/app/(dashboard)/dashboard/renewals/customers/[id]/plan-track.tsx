"use client";

import { useState } from "react";
import { CalendarClockIcon, MessageCircleIcon, PhoneIcon, StickyNoteIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { TrackStatusBoard } from "../../_track/track-status";
import { TrackNoteDialog, type TrackNoteKind } from "../../_track/track-note-dialog";
import { TrackTimeline } from "../../_track/track-timeline";
import { isClosedTrack } from "@/lib/renewals/status";
import type { RenewalPlan } from "@/lib/services/renewals.service";

/** One plan's tracking: status board, quick actions, and its activity log. */
export function PlanTrack({ plan, customerPublicId }: { plan: RenewalPlan; customerPublicId: string }) {
  const [kind, setKind] = useState<TrackNoteKind | null>(null);
  const closed = isClosedTrack(plan.track.status);
  return (
    <div className="flex flex-col gap-4">
      <TrackStatusBoard orderPublicId={plan.orderPublicId} customerPublicId={customerPublicId} status={plan.track.status} source={plan.track.source} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setKind("note")}>
          <StickyNoteIcon /> Add note
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setKind("call")}>
          <PhoneIcon /> Log call
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setKind("whatsapp")}>
          <MessageCircleIcon /> Log WhatsApp
        </Button>
        {!closed && (
          <Button type="button" variant="outline" size="sm" onClick={() => setKind("follow_up")}>
            <CalendarClockIcon /> Set follow-up
          </Button>
        )}
      </div>
      <TrackTimeline activities={plan.activities} onAddNote={() => setKind("note")} />
      {kind && (
        <TrackNoteDialog
          orderPublicId={plan.orderPublicId}
          customerPublicId={customerPublicId}
          kind={kind}
          open
          onOpenChange={(open) => !open && setKind(null)}
          closed={closed}
        />
      )}
    </div>
  );
}
