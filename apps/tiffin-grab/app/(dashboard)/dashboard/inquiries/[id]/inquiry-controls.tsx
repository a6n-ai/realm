"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@realm/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { Textarea } from "@realm/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@realm/ui/tooltip";
import { HelpCircleIcon } from "lucide-react";
import { markLost, setStage } from "../actions";
import type { InquiryStage, LostReason } from "@/lib/services/inquiries.service";

const STAGES: InquiryStage[] = ["new", "contacted", "quoted", "follow_up", "converted", "lost"];

const LOST_REASONS: { value: LostReason; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "out_of_zone", label: "Out of zone" },
  { value: "no_response", label: "No response" },
  { value: "chose_competitor", label: "Chose competitor" },
  { value: "not_ready", label: "Not ready" },
  { value: "other", label: "Other" },
];

export function StageControl({ inquiryId, stage }: { inquiryId: string; stage: InquiryStage }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <Select
        defaultValue={stage}
        disabled={pending}
        onValueChange={(v) => start(async () => {
          const { previous } = await setStage(inquiryId, v as InquiryStage);
          router.refresh();
          if (previous !== v) {
            toast(`Stage → ${v}`, {
              action: {
                label: "Undo",
                onClick: () => start(async () => { await setStage(inquiryId, previous); router.refresh(); }),
              },
            });
          }
        })}
      >
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
      </Select>
      <Tooltip>
        <TooltipTrigger asChild><button type="button" aria-label="What is a stage?"><HelpCircleIcon className="text-muted-foreground size-4" /></button></TooltipTrigger>
        <TooltipContent>Where this lead sits in the pipeline: new → contacted → quoted → follow-up → converted / lost.</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function MarkLostDialog({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<LostReason>("price");
  const [note, setNote] = useState("");

  function confirm() {
    start(async () => {
      await markLost(inquiryId, reason, note.trim() || undefined);
      setOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Mark lost</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark inquiry as lost</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Reason</label>
            <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Textarea
            placeholder="Note (optional)…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>Cancel</Button>
          </DialogClose>
          <Button variant="destructive" disabled={pending} onClick={confirm}>Mark lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
