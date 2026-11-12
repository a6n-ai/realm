"use client";

import { useState, useTransition } from "react";
import { PrinterIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foundry/ui/dialog";
import { unreleasedWeekMessage } from "@/lib/menu/unreleased-week";

export function labelsPrintBlockReason({
  menuReleased,
  labelCount,
  weekStart,
}: {
  menuReleased: boolean;
  labelCount: number;
  weekStart: string;
}): string | null {
  if (!menuReleased) {
    return unreleasedWeekMessage(weekStart);
  }
  if (labelCount === 0) {
    return "No tiffin deliveries scheduled for this date.";
  }
  return null;
}

export function LabelsPrintButton({
  dateIso,
  weekStart,
  menuReleased,
  labelCount,
}: {
  dateIso: string;
  weekStart: string;
  menuReleased: boolean;
  labelCount: number;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const print = () => {
    const blocked = labelsPrintBlockReason({ menuReleased, labelCount, weekStart });
    if (blocked) {
      setMessage(blocked);
      return;
    }
    start(async () => {
      try {
        const res = await fetch(`/dashboard/labels/pdf?date=${dateIso}`);
        if (!res.ok) {
          const body = (await res.text()).trim();
          setMessage(body || "Could not print labels.");
          return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `labels-${dateIso}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        toast.error("Could not print labels.");
      }
    });
  };

  return (
    <>
      <Button onClick={print} disabled={pending}>
        <PrinterIcon data-icon="inline-start" /> Print labels
      </Button>
      <Dialog open={message != null} onOpenChange={(open) => { if (!open) setMessage(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Can't print labels</DialogTitle>
            <DialogDescription>{message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setMessage(null)}>OK</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
