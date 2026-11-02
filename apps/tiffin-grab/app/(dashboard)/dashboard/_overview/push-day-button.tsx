"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SendIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { pushDayAction } from "../dispatch/actions";

export function PushDayButton({ date, dayLabel, stops, label = "Push to OptimoRoute" }: { date: string; dayLabel: string; stops: number; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  function push() {
    start(async () => {
      try {
        const res = await pushDayAction(date);
        if (res.failed > 0) toast.warning(`Sent ${res.pushed}, ${res.failed} stop${res.failed === 1 ? "" : "s"} failed`);
        else toast.success(`Sent ${res.pushed} stop${res.pushed === 1 ? "" : "s"} to OptimoRoute`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Push failed");
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <SendIcon data-icon="inline-start" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Send {stops} stop{stops === 1 ? "" : "s"} for {dayLabel}?
            </DialogTitle>
            <DialogDescription>
              This sends every franchise&apos;s stops for the day to OptimoRoute, the same as Dispatch. Sending again is
              harmless: stops that already match are left alone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={push}>
              {pending ? "Sending…" : `Send ${stops} stop${stops === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
