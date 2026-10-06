"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { cancelBookingAction } from "./booking-actions";

/** Two-step so a stray tap can't cancel a family's seat. */
export function CancelBookingButton({ bookingPublicId }: { bookingPublicId: string }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <Button type="button" size="sm" variant="outline" onClick={() => setArmed(true)}>
        Cancel booking
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await cancelBookingAction(bookingPublicId);
            if (res.error) toast.error(res.error);
            else toast.success("Booking cancelled");
            setArmed(false);
          })
        }
      >
        {pending ? "Cancelling…" : "Confirm cancel"}
      </Button>
      <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setArmed(false)}>
        Keep
      </Button>
    </div>
  );
}
