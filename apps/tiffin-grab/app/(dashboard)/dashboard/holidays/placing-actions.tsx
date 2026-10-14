"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarPlusIcon, CircleSlashIcon, SquareArrowOutUpRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { ResponsiveDialog, RowActionTooltipButton } from "@/components/ds";
import { humanDate } from "@/lib/deliveries-view";
import { dismissHolidayDayAction, placeHolidayDayAction } from "./actions";

/**
 * Row actions for a closed day still waiting: Place (staff pick the first day; the service takes
 * the first free plan weekdays on or after it), open the order, or Dismiss (written off, logged).
 */
export function PlacingActions({ deliveryPublicId, orderPublicId, label, date: closedDate, today }: {
  deliveryPublicId: string; orderPublicId: string; label: string; date: string; today: string;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"place" | "dismiss" | null>(null);
  const [date, setDate] = useState("");
  const [pending, start] = useTransition();
  const run = (fn: () => ReturnType<typeof placeHolidayDayAction>) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) return void toast.error(res.error);
      toast.success(res.message ?? "Done");
      setDialog(null);
      router.refresh();
    });

  return (
    <div className="flex justify-end gap-1">
      <RowActionTooltipButton icon={CalendarPlusIcon} label="Place" hint="Place: pick the first day it can go" onClick={() => { setDate(""); setDialog("place"); }} />
      <RowActionTooltipButton icon={SquareArrowOutUpRightIcon} label="Open order" onClick={() => router.push(`/dashboard/orders/${orderPublicId}`)} />
      <RowActionTooltipButton icon={CircleSlashIcon} label="Dismiss" hint="Dismiss: don't place this day" tone="text-destructive" onClick={() => setDialog("dismiss")} />
      <ResponsiveDialog
        open={dialog === "place"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title="Place the closed day"
        description={`${label} · ${humanDate(closedDate)}. The tiffins go on the plan's first free delivery days on or after the day you pick.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={pending || !date} onClick={() => run(() => placeHolidayDayAction(deliveryPublicId, date))}>{pending ? "Placing…" : "Place"}</Button>
          </div>
        }
      >
        <Input type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} aria-label="First day to place on" className="w-48" />
      </ResponsiveDialog>
      <ResponsiveDialog
        open={dialog === "dismiss"}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title="Dismiss this closed day?"
        description={`${label} · ${humanDate(closedDate)}. It leaves Needs placing and won't get another day. This is noted on the order.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => dismissHolidayDayAction(deliveryPublicId))}>{pending ? "Dismissing…" : "Dismiss"}</Button>
          </div>
        }
      >
        {null}
      </ResponsiveDialog>
    </div>
  );
}
