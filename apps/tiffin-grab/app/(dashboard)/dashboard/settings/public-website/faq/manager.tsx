"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Skeleton } from "@foundry/ui/skeleton";
import { Switch } from "@foundry/ui/switch";
import { Textarea } from "@foundry/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@foundry/ui/dialog";
import type { Faq } from "@/lib/services/faqs.service";
import { retireFaqAction, saveFaqAction } from "./actions";

/** Blank row that puts the dialog into create mode. */
const NEW_FAQ: Faq = { publicId: "", question: "", answer: "", sortOrder: 0, active: true };

export function FaqManager({ faqs }: { faqs: Faq[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Faq | null>(null);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Shown on /faq. No entries here means the page shows nothing yet.
        </p>
        <Button type="button" size="sm" onClick={() => setEditing(NEW_FAQ)}>
          <PlusIcon className="mr-1.5 size-4" />
          Add FAQ
        </Button>
      </div>

      {faqs.length === 0 ? (
        <div className="text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
          No FAQ entries yet. Add one to show it on the public site.
        </div>
      ) : (
        <div className="grid gap-3">
          {faqs.map((f) => (
            <div key={f.publicId} className="bg-card flex items-start justify-between gap-3 rounded-xl border p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{f.question}</span>
                  <Badge variant={f.active ? "default" : "outline"}>{f.active ? "Active" : "Retired"}</Badge>
                </div>
                <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">{f.answer}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2"
                aria-label={`Edit ${f.question}`}
                onClick={() => setEditing(f)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <FaqEditDialog faq={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={() => router.refresh()} />
    </div>
  );
}

function FaqEditDialog({
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
          <DialogDescription>Shown on /faq.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="faq-question">Question</Label>
            <Input id="faq-question" value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="faq-answer">Answer</Label>
            <Textarea id="faq-answer" value={answer} onChange={(e) => setAnswer(e.target.value)} rows={5} />
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

export function FaqManagerSkeleton() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-8 w-28" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border p-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
