"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@foundry/ui/toggle-group";
import { Textarea } from "@foundry/ui/textarea";
import { ResponsiveDialog } from "@foundry/design-system";
import { FollowUpPicker, type FollowUpValue } from "@/components/dashboard/pipeline/follow-up-picker";
import { unwrapAction } from "@/lib/actions/unwrap";
import { addNote, logActivity } from "../actions";

export const CALL_OUTCOMES = ["Answered", "Voicemail", "No answer"] as const;
type Mode = "note" | "call" | "follow_up";

/** Note, call outcome and follow-up on one draft. Saves through the same actions as the note dialog. */
export function Composer({ inquiryId, timeZone, onSaved }: { inquiryId: string; timeZone: string; onSaved?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<Mode>("note");
  const [text, setText] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [followUp, setFollowUp] = useState<FollowUpValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const note = text.trim() || undefined;
  const canSave = mode === "note" ? !!note : mode === "call" ? !!outcome : !!followUp;

  function save() {
    start(async () => {
      try {
        setError(null);
        if (mode === "note") await unwrapAction(addNote(inquiryId, note!));
        else if (mode === "call") await unwrapAction(logActivity(inquiryId, { type: "call", outcome, note }));
        else await unwrapAction(logActivity(inquiryId, { type: "callback", note, nextFollowUpAt: followUp!.at }));
        toast.success("Saved to activity");
        setText("");
        setOutcome("");
        setFollowUp(null);
        onSaved?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Tabs value={mode} onValueChange={(v) => { setMode(v as Mode); setError(null); }}>
        <TabsList>
          <TabsTrigger value="note">Note</TabsTrigger>
          <TabsTrigger value="call">Call outcome</TabsTrigger>
          <TabsTrigger value="follow_up">Follow-up</TabsTrigger>
        </TabsList>
        <TabsContent value="note" className="flex flex-col gap-3">
          <Textarea aria-label="Note" placeholder="Add a note" value={text} onChange={(e) => setText(e.target.value)} />
        </TabsContent>
        <TabsContent value="call" className="flex flex-col gap-3">
          <ToggleGroup type="single" variant="outline" size="sm" value={outcome} onValueChange={setOutcome} aria-label="Call outcome">
            {CALL_OUTCOMES.map((o) => (
              <ToggleGroupItem key={o} value={o}>{o}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Textarea aria-label="Call notes" placeholder="Notes (optional)" value={text} onChange={(e) => setText(e.target.value)} />
        </TabsContent>
        <TabsContent value="follow_up" className="flex flex-col gap-3">
          <FollowUpPicker timeZone={timeZone} value={followUp} onChange={setFollowUp} />
          <Textarea aria-label="Follow-up notes" placeholder="What to follow up on (optional)" value={text} onChange={(e) => setText(e.target.value)} />
        </TabsContent>
      </Tabs>
      {error ? <p role="alert" className="text-destructive text-sm">{error}</p> : null}
      <div className="flex justify-end">
        <Button disabled={pending || !canSave} onClick={save}>Save</Button>
      </div>
    </div>
  );
}

/** Desktop: inline card. Mobile: a button that opens the same composer in a top drawer. */
export function InlineComposer({ inquiryId, timeZone }: { inquiryId: string; timeZone: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Card className="hidden lg:block">
        <CardHeader>
          <CardTitle>Log activity</CardTitle>
        </CardHeader>
        <CardContent>
          <Composer inquiryId={inquiryId} timeZone={timeZone} />
        </CardContent>
      </Card>
      <Button variant="outline" className="lg:hidden" onClick={() => setOpen(true)}>Log activity</Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Log activity" description="Saved to the lead's activity timeline.">
        <Composer inquiryId={inquiryId} timeZone={timeZone} onSaved={() => setOpen(false)} />
      </ResponsiveDialog>
    </>
  );
}
