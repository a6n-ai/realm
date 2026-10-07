"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Switch } from "@foundry/ui/switch";
import { Textarea } from "@foundry/ui/textarea";
import { ResponsiveDialog } from "@/components/ds";
import { unwrapAction } from "@/lib/actions/unwrap";
import { grantComplimentaryAction } from "./actions";

const dayName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);
const NONE = "none";

export type MissedOption = { publicId: string; label: string };

/** Admin: give one free tiffin on a chosen day, with a reason the customer sees. */
export function ComplimentaryControl({
  orderId,
  ended,
  minDate,
  allowedDays,
  otherPlanEnd = null,
  missed = [],
}: {
  orderId: string;
  /** The plan is over: a grant reopens it. */
  ended: boolean;
  minDate: string;
  allowedDays: string[];
  /** First free day after the customer's other running plans, when they have any. */
  otherPlanEnd?: string | null;
  /** This plan's missed days with no make-up or free tiffin yet. */
  missed?: MissedOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [notify, setNotify] = useState(true);
  const [forId, setForId] = useState(NONE);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await unwrapAction(grantComplimentaryAction(orderId, { date, note, notify, forDeliveryPublicId: forId === NONE ? null : forId }));
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add the complimentary tiffin");
      }
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) { setDate(""); setNote(""); setNotify(true); setForId(NONE); setError(null); }
      }}
      trigger={<Button size="sm" variant="outline">Give free tiffin</Button>}
      title="Give a complimentary tiffin"
      description={ended
        ? "This plan is over. Adding a free tiffin reopens it until that day is delivered."
        : "One free tiffin on the day you pick. It is not billed."}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !date || !note.trim()} onClick={save}>{pending ? "Adding…" : "Add free tiffin"}</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="comp-date">Delivery date</Label>
          <Input id="comp-date" type="date" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          <p className="text-muted-foreground text-xs">
            Earliest {minDate}{allowedDays.length ? ` · delivers on ${allowedDays.map(dayName).join(", ")}` : ""}
          </p>
          {otherPlanEnd && otherPlanEnd > minDate ? (
            <p className="text-muted-foreground text-xs text-pretty">
              This customer has another plan running until {otherPlanEnd}. Days inside it are refused; give the tiffin on that plan instead.
            </p>
          ) : null}
        </div>
        {missed.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor="comp-for">Makes up for (optional)</Label>
            <Select value={forId} onValueChange={setForId}>
              <SelectTrigger id="comp-for" className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>No specific delivery</SelectItem>
                {missed.map((m) => <SelectItem key={m.publicId} value={m.publicId}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid gap-2">
          <Label htmlFor="comp-note">Reason (the customer sees this)</Label>
          <Textarea id="comp-note" maxLength={300} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sorry we missed your delivery on Oct 3." />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="comp-notify" checked={notify} onCheckedChange={setNotify} />
          <Label htmlFor="comp-notify">Email and notify the customer</Label>
        </div>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
