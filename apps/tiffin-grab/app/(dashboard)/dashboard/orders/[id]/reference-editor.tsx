"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { updatePaymentReferenceAction } from "./actions";

/** A payment's transfer reference, editable by staff in place. Shared by the order Payments tab and the Payments page dialog. */
export function ReferenceEditor({
  orderId,
  paymentId,
  reference,
  allowAdd,
  label = "Reference: ",
}: {
  orderId: string;
  paymentId: string;
  reference: string | null;
  /** Offer "Add reference" when there is none (not for simulated payments). */
  allowAdd: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<string | null>(null);
  // The Payments dialog renders a row snapshot, so show the saved value without waiting for the list to refresh.
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const current = saved === undefined ? reference : saved;

  function save() {
    if (draft == null) return;
    start(async () => {
      const res = await updatePaymentReferenceAction(orderId, paymentId, draft);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      setSaved(draft.trim() || null);
      setDraft(null);
      toast.success(draft.trim() ? "Reference updated" : "Reference cleared");
      router.refresh();
    });
  }

  if (draft != null) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Label htmlFor={`ref-${paymentId}`} className="text-sm font-normal">Reference</Label>
        <Input
          id={`ref-${paymentId}`}
          autoFocus
          maxLength={120}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && (e.stopPropagation(), setDraft(null))}
          className="h-8 w-56 font-mono"
          placeholder="Bank / e-Transfer reference"
        />
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setDraft(null)}>Cancel</Button>
      </form>
    );
  }
  if (current) {
    return (
      <span className="inline-flex items-center gap-1 text-sm">
        {label}<span className="font-mono break-all">{current}</span>
        <Button type="button" size="icon" variant="ghost" className="size-7" aria-label="Edit reference" onClick={() => setDraft(current)}>
          <PencilIcon className="size-3.5" />
        </Button>
      </span>
    );
  }
  return allowAdd ? (
    <Button type="button" size="sm" variant="link" className="h-auto p-0" onClick={() => setDraft("")}>
      Add reference
    </Button>
  ) : (
    <span>-</span>
  );
}
