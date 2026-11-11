"use client";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";

/** Wording for the cancel confirm, shared by the Next order card and the order page. */
export const CANCEL_ORDER_COPY = {
  title: "Cancel this order?",
  description: "This cancels the subscription and all its scheduled deliveries. This cannot be undone.",
  keep: "Keep order",
  confirm: "Cancel order",
};

/** The confirm step only; the caller runs the existing `cancel(orderId)` action on confirm. */
export function CancelOrderDialog({ open, onOpenChange, pending, onConfirm }: { open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{CANCEL_ORDER_COPY.title}</DialogTitle>
          <DialogDescription>{CANCEL_ORDER_COPY.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {CANCEL_ORDER_COPY.keep}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {CANCEL_ORDER_COPY.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
