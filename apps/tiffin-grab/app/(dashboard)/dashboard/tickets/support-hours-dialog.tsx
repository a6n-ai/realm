"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ClockIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Switch } from "@foundry/ui/switch";
import { ResponsiveDialog } from "@/components/ds";
import { unwrapAction } from "@/lib/actions/unwrap";
import { WEEK_ORDER, type DayHours, type SupportHours } from "@/lib/support/support-hours";
import { saveSupportHours } from "./actions";

const DAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NEW_DAY: DayHours = { open: "09:00", close: "18:00" };

/** Admin: which days support runs, the hours on each, and the usual reply time customers are shown. */
export function SupportHoursDialog({ value }: { value: SupportHours }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(value.days);
  const [reply, setReply] = useState(value.replyWithinHours == null ? "" : String(value.replyWithinHours));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setDay = (i: number, d: DayHours | null) => setDays((prev) => prev.map((p, j) => (j === i ? d : p)));

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await unwrapAction(saveSupportHours({ days, replyWithinHours: reply.trim() === "" ? null : Number(reply) }));
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save support hours");
      }
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDays(value.days);
          setReply(value.replyWithinHours == null ? "" : String(value.replyWithinHours));
          setError(null);
        }
      }}
      trigger={<Button variant="outline"><ClockIcon /> Support hours</Button>}
      title="Support hours"
      description="Customers see these in Support, in the app timezone. Turn a day off when there is no support that day."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <div className="grid gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="grid gap-2">
          {WEEK_ORDER.map((i) => {
            const d = days[i];
            return (
              <div key={i} className="flex min-h-9 items-center gap-3">
                <Switch id={`support-day-${i}`} checked={d != null} onCheckedChange={(on) => setDay(i, on ? NEW_DAY : null)} />
                <Label htmlFor={`support-day-${i}`} className="w-24">{DAY_LABELS[i]}</Label>
                {d ? (
                  <>
                    <Input type="time" aria-label={`${DAY_LABELS[i]} opens`} value={d.open} onChange={(e) => setDay(i, { ...d, open: e.target.value })} className="w-32" />
                    <span className="text-muted-foreground text-sm">to</span>
                    <Input type="time" aria-label={`${DAY_LABELS[i]} closes`} value={d.close} onChange={(e) => setDay(i, { ...d, close: e.target.value })} className="w-32" />
                  </>
                ) : (
                  <span className="text-muted-foreground text-sm">No support</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="support-reply-hours">Usual reply time (hours)</Label>
          <Input id="support-reply-hours" type="number" min={1} max={168} step={1} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Not shown" className="w-32" />
          <p className="text-muted-foreground text-xs">Shown as &ldquo;We usually reply within N hours&rdquo;. Leave blank to show hours only.</p>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
