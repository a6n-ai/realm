"use client";

import { useState } from "react";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@foundry/ui/dialog";
import { Textarea } from "@foundry/ui/textarea";

export function ReasonDialog<R extends string>({
  open, onOpenChange, pending, title, confirmLabel, reasons, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  title: string;
  confirmLabel: string;
  reasons: { value: R; label: string }[];
  onSave: (reason: R, note?: string) => void;
}) {
  const [reason, setReason] = useState<R | "">("");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col gap-4 sm:max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <Button key={r.value} type="button" size="sm" variant={reason === r.value ? "default" : "outline"} onClick={() => setReason(r.value)}>
              {r.label}
            </Button>
          ))}
        </div>
        <Textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="destructive" disabled={pending || reason === ""} onClick={() => reason && onSave(reason, note.trim() || undefined)}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
