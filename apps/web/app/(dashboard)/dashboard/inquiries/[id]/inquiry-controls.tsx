"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addNote, setStage } from "../actions";
import type { InquiryStage } from "@/lib/services/inquiries.service";

const STAGES: InquiryStage[] = ["new", "contacted", "follow_up", "converted", "lost"];

export function StageControl({ inquiryId, stage }: { inquiryId: string; stage: InquiryStage }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      defaultValue={stage}
      disabled={pending}
      onValueChange={(v) => start(async () => { await setStage(inquiryId, v as InquiryStage); router.refresh(); })}
    >
      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
      <SelectContent>{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
    </Select>
  );
}

export function NoteForm({ inquiryId }: { inquiryId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  return (
    <div className="space-y-2">
      <textarea
        className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
        placeholder="Add a follow-up note…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Button
        disabled={pending || !note.trim()}
        onClick={() => start(async () => { await addNote(inquiryId, note.trim()); setNote(""); router.refresh(); })}
        className="w-fit"
      >
        Add note
      </Button>
    </div>
  );
}
