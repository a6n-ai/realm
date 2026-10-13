"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { Textarea } from "@foundry/ui/textarea";
import { ResponsiveDialog } from "@/components/ds";
import { setLookOutAction } from "./actions";

/** Any staff member: flag this order for the whole team to watch, or clear the flag. */
export function LookOutControl({ orderId, flagged }: { orderId: string; flagged: boolean }) {
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
      toast.success(on ? "Marked look out for" : "Look out for cleared");
      setOpen(false);
      router.refresh();
    });

  if (flagged) {
    return (
      <Button size="sm" variant="outline" disabled={pending} onClick={() => save(false)}>
        <EyeOffIcon data-icon="inline-start" />
        Clear look out
      </Button>
    );
  }
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setNote("");
      }}
      trigger={<Button size="sm" variant="outline"><EyeIcon data-icon="inline-start" />Look out for</Button>}
      title="Look out for this order"
      description="It joins the Look out for tab on Orders, where every team member sees it until someone clears it."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={() => save(true)}>{pending ? "Saving…" : "Mark look out for"}</Button>
        </div>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="look-out-note">What should the team watch for? (optional)</Label>
        <Textarea id="look-out-note" maxLength={300} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Customer asked for a call before each delivery." />
      </div>
    </ResponsiveDialog>
  );
}
