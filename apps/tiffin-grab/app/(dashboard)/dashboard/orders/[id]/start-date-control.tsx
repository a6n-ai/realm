"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { ResponsiveDialog } from "@/components/ds";
import { unwrapAction } from "@/lib/actions/unwrap";
import { changeStartDateAction } from "./actions";

const dayName = (d: string) => d.charAt(0).toUpperCase() + d.slice(1);

/** Admin: move a plan's start date until it starts. The server rebuilds its deliveries. */
export function StartDateControl({
  orderId,
  startDate,
  minDate,
  allowedDays,
  blockedReason = null,
}: {
  /** Why the start can't move; shown as a tooltip on a disabled Edit. */
  blockedReason?: string | null;
  orderId: string;
  startDate: string;
  minDate: string;
  allowedDays: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(startDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (blockedReason) {
    return (
      <Tooltip>
        {/* aria-disabled, not disabled: a disabled button gets no hover, so the reason would never show. */}
        <TooltipTrigger asChild>
          <Button size="sm" variant="ghost" aria-disabled className="text-muted-foreground -my-1 h-7 cursor-not-allowed px-2 opacity-50" onClick={(e) => e.preventDefault()}>
            Edit
          </Button>
        </TooltipTrigger>
        <TooltipContent className="max-w-60 text-pretty">{blockedReason}.</TooltipContent>
      </Tooltip>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await unwrapAction(changeStartDateAction(orderId, value));
        setOpen(false);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't change the start date");
      }
    });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) { setValue(startDate); setError(null); }
      }}
      trigger={<Button size="sm" variant="ghost" className="-my-1 h-7 px-2">Edit</Button>}
      title="Change start date"
      description="The plan hasn't started, so its deliveries are rescheduled from the new date. Nothing else changes."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !value || value === startDate} onClick={save}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      }
    >
      <div className="grid gap-2">
        <Label htmlFor="order-start-date">Start date</Label>
        <Input id="order-start-date" type="date" min={minDate} value={value} onChange={(e) => setValue(e.target.value)} className="w-48" />
        <p className="text-muted-foreground text-xs">Earliest {minDate} · starts on {allowedDays.map(dayName).join(", ")}</p>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      </div>
    </ResponsiveDialog>
  );
}
