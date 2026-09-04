"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foundry/ui/dialog";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { Textarea } from "@foundry/ui/textarea";
import type { Faq } from "@/lib/services/faqs.service";
import { retireFaqAction, saveFaqAction } from "./actions";

export function FaqEditDialog({
  faq,
  onOpenChange,
  onSaved,
}: {
  /** null closes the dialog; a faq with no publicId opens it in create mode. */
  faq: Faq | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = faq !== null && faq.publicId === "";
  const [question, setQuestion] = useState(faq?.question ?? "");
  const [answer, setAnswer] = useState(faq?.answer ?? "");
  const [active, setActive] = useState(faq?.active ?? true);
  const [pending, start] = useTransition();
  const [retiring, startRetire] = useTransition();
  const busy = pending || retiring;

  function save() {
    start(async () => {
      const res = await saveFaqAction({
        publicId: isNew ? null : (faq?.publicId ?? null),
        question,
        answer,
        active,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(isNew ? "FAQ created" : "FAQ saved");
      onSaved();
      onOpenChange(false);
    });
  }

  function retire() {
    if (!faq || isNew) return;
    startRetire(async () => {
      const res = await retireFaqAction(faq.publicId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("FAQ retired");
      onSaved();
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={faq !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add FAQ" : "Edit FAQ"}</DialogTitle>
          <DialogDescription>Shown on /faq and the home page&apos;s FAQ section.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="faq-question">Question</Label>
            <Input
              id="faq-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What are Puchkaman's hours?"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-answer">Answer</Label>
            <Textarea
              id="faq-answer"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={5}
              placeholder="We're open..."
            />
          </div>
          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
            <span className="text-sm font-medium">Active</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {!isNew ? (
            <Button type="button" variant="outline" disabled={busy || !active} onClick={retire}>
              {active ? "Retire" : "Retired"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" disabled={busy || !question.trim() || !answer.trim()} onClick={save}>
            {pending ? "Saving…" : isNew ? "Create" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
