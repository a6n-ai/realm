"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { ResponsiveDialog } from "@/components/ds";
import { setLookOutAction } from "./actions";

/**
 * Any staff member: flag this order for the whole team to watch, always with a note.
 * On a flagged order (flaggedNote set) it offers Edit note, which re-marks it, and Unmark,
 * which asks why.
 */
export function LookOutControl({ orderId, flaggedNote }: { orderId: string; flaggedNote?: string }) {
  if (flaggedNote === undefined) {
    return (
      <NoteDialog
        orderId={orderId}
        on
        trigger={<Button size="sm" variant="outline"><EyeIcon data-icon="inline-start" />Look out for</Button>}
        title="Look out for this order"
        description="It joins the Look out for tab on Orders, where every team member sees it until someone unmarks it."
        submit="Mark look out for"
        done="Marked look out for"
      />
    );
  }
  return (
    <>
      <NoteDialog
        orderId={orderId}
        on
        initial={flaggedNote}
        trigger={<Button size="sm" variant="outline"><PencilIcon data-icon="inline-start" />Edit note</Button>}
        title="Edit look out note"
        description="Saving marks it again under your name with the new note."
        submit="Save note"
        done="Note updated"
      />
      <NoteDialog
        orderId={orderId}
        on={false}
        trigger={<Button size="sm" variant="outline"><EyeOffIcon data-icon="inline-start" />Unmark</Button>}
        title="Unmark this order"
        description="It leaves the Look out for tab. Your note is kept in the order's activity."
        label="Why is it being unmarked?"
        placeholder="Spoke to the customer, issue sorted."
        submit="Unmark"
        done="Look out for removed"
      />
    </>
  );
}

function NoteDialog({
  orderId,
  on,
  initial = "",
  trigger,
  title,
  description,
  label = "What should the team watch for?",
  placeholder = "Customer asked for a call before each delivery.",
  submit,
  done,
}: {
  orderId: string;
  on: boolean;
  initial?: string;
  trigger: ReactNode;
  title: string;
  description: string;
  label?: string;
  placeholder?: string;
  submit: string;
  done: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const id = on ? "look-out-note" : "look-out-unmark-note";

  const save = () =>
    start(async () => {
      const res = await setLookOutAction(orderId, on, note);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      toast.success(done);
      setOpen(false);
      router.refresh();
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNote(initial);
      }}
      trigger={trigger}
      title={title}
      description={description}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !note.trim()} onClick={save}>{pending ? "Saving…" : submit}</Button>
        </div>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor={id}>{label}</Label>
        <Textarea id={id} required maxLength={300} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} />
      </div>
    </ResponsiveDialog>
  );
}
