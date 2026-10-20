"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Badge } from "@/components/reui/badge";
import { setDeliveryStatusAction } from "@/app/(dashboard)/dashboard/orders/[id]/actions";
import { humanDate, type Trip } from "@/lib/deliveries-view";

/** What staff can set; derived from the trip by `statusChoice` in the hub. */
export type StatusValue = "upcoming" | "delivered" | "on_hold" | "not_delivered" | "paused";

type Confirm = "hold" | "not-delivered" | null;

/**
 * One status, said in plain words, with only the buttons that make sense right now. Replaces a dropdown
 * that mixed the current state with actions (and listed states nobody could pick), which confused sales.
 * Every change still goes through setDeliveryStatusAction; nothing here changes a rule.
 */
export function DeliveryStatusCard({
  deliveryId, value, fallbackLabel, detail, trip, now, beforeDay, onDone, children,
}: {
  deliveryId: string | null;
  /** Null when staff can't set a status here (holiday, moved day, no permission): the badge alone, from fallbackLabel. */
  value: StatusValue | null;
  fallbackLabel: string;
  /** Extra explanation under the status, e.g. a holiday and where its tiffin went. */
  detail?: ReactNode;
  /** The day's own actions (Edit meal, Move, Pause or Resume), so everything for this day sits in one box. */
  children?: ReactNode;
  trip: Trip;
  now: number;
  /** The delivery date hasn't come yet, so it can't have been delivered or missed. */
  beforeDay: boolean;
  onDone: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const cutoffPassed = trip.cutoffAt <= now;
  const save = (next: "upcoming" | "delivered" | "not_delivered", message: string) =>
    startTransition(async () => {
      if (!deliveryId) return;
      const res = await setDeliveryStatusAction(deliveryId, next);
      if ("error" in res) toast.error(res.error);
      else onDone(message);
      setConfirm(null);
    });

  const view = ((): { badge: ReactNode; line: string | null; actions: ReactNode } => {
    switch (value) {
      case null:
        return { badge: <Badge variant="outline">{fallbackLabel}</Badge>, line: null, actions: null };
      case "delivered":
        return {
          badge: <Badge variant="success-light">Delivered</Badge>,
          line: `Delivered on ${humanDate(trip.date)}.`,
          actions: (
            <Button type="button" variant="ghost" size="sm" className="self-start" disabled={pending} onClick={() => save("upcoming", "Delivery set back to awaiting confirmation")}>
              <Undo2 data-icon="inline-start" />Undo
            </Button>
          ),
        };
      case "on_hold":
        return { badge: <Badge variant="warning-light">On hold</Badge>, line: `${beforeDay ? "Held by staff. This tiffin won't go out on this day." : "Held by staff: it wasn't delivered on this day."} Release the hold below to give it a new day.`, actions: null };
      case "not_delivered":
        return { badge: <Badge variant="destructive-light">Not delivered</Badge>, line: "The driver couldn't deliver it. Release the hold below to give it a new day.", actions: null };
      case "paused":
        return { badge: <Badge variant="warning-light">Paused</Badge>, line: "Paused for this day. Resume or move it with the buttons below.", actions: null };
      case "upcoming":
        if (!cutoffPassed) {
          return { badge: <Badge variant="info-light">Upcoming</Badge>, line: "Nothing to confirm yet.", actions: null };
        }
        if (beforeDay) {
          return {
            badge: <Badge variant="primary-light">Being prepared</Badge>,
            line: "Cutoff has passed, so the kitchen is preparing it.",
            actions: (
              <Button type="button" variant="outline" size="sm" className="self-start" disabled={pending} onClick={() => setConfirm("hold")}>Put on hold…</Button>
            ),
          };
        }
        return {
          badge: <Badge variant="primary-light">Awaiting confirmation</Badge>,
          line: "The driver hasn't confirmed this delivery yet.",
          actions: (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={pending} onClick={() => save("delivered", "Marked delivered")}><Check data-icon="inline-start" />Mark delivered</Button>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setConfirm("not-delivered")}>Mark not delivered…</Button>
            </div>
          ),
        };
    }
  })();

  return (
    <section aria-label="Delivery status" data-testid="status-card" className="bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">Status</span>
        {view.badge}
      </div>
      {view.line && <p className="text-sm">{view.line}</p>}
      {detail}
      {view.actions}
      {/* Hidden when the day has no actions (holiday, finished), so no empty divider is left behind. */}
      {children && <div className="border-t pt-3 empty:hidden">{children}</div>}
      <Dialog open={confirm != null} onOpenChange={(o) => !pending && !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "hold" ? "Put this delivery on hold?" : "Mark this delivery as not delivered?"}</DialogTitle>
            <DialogDescription>
              {confirm === "hold"
                ? "This can't be undone. The tiffin won't go out this day."
                : "This can't be undone. The tiffin counts as missed for this day."}{" "}
              After midnight, release the hold to give it a new day so the customer doesn&apos;t lose it.
            </DialogDescription>
          </DialogHeader>
          {confirm === "hold" && (
            <p className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-sm">
              The kitchen may have prepared it and the label may be printed. Tell the kitchen and the driver.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="destructive" disabled={pending} onClick={() => save("not_delivered", confirm === "hold" ? "Delivery put on hold" : "Marked not delivered")}>
              {confirm === "hold" ? "Put on hold" : "Mark not delivered"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
