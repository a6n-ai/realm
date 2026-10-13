"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { ResponsiveDialog } from "@/components/ds";
import { setLookOutAction } from "./actions";

/**
 * Any staff member: flag this order for the whole team to watch, always with a note.
 * On a flagged order (flaggedNote set) it offers Edit note, which re-marks it, and Unmark.
 */
export function LookOutControl({ orderId, flaggedNote }: { orderId: string; flaggedNote?: string }) {
  const flagged = flaggedNote !== undefined;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const save = (on: boolean) =>
    start(async () => {
      const res = await setLookOutAction(orderId, on, on ? note : "");
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(!on ? "Look out for removed" : flagged ? "Note updated" : "Marked look out for");
      setOpen(false);
      router.refresh();
    });

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setNote(flaggedNote ?? "");
        }}
        trigger={
          flagged
            ? <Button size="sm" variant="outline"><PencilIcon data-icon="inline-start" />Edit note</Button>
            : <Button size="sm" variant="outline"><EyeIcon data-icon="inline-start" />Look out for</Button>
        }
        title={flagged ? "Edit look out note" : "Look out for this order"}
        description={flagged
          ? "Saving marks it again under your name with the new note."
          : "It joins the Look out for tab on Orders, where every team member sees it until someone unmarks it."}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || !note.trim()} onClick={() => save(true)}>{pending ? "Saving…" : flagged ? "Save note" : "Mark look out for"}</Button>
          </div>
        }
      >
        <div className="grid gap-2">
          <Label htmlFor="look-out-note">What should the team watch for?</Label>
          <Textarea id="look-out-note" required maxLength={300} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Customer asked for a call before each delivery." />
        </div>
      </ResponsiveDialog>
      {flagged && (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => save(false)}>
          <EyeOffIcon data-icon="inline-start" />
          Unmark
        </Button>
      )}
    </>
  );
}
