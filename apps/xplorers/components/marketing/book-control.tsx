"use client";

import { useActionState } from "react";
import { Button } from "@/components/marketing/ui";
import { createBookingAction, type BookState } from "@/app/(marketing)/whats-on/actions";

export function BookControl({
  publicId,
  remaining,
  signedIn,
  isFamily,
  booked,
  autofocus,
}: {
  publicId: string;
  remaining: number;
  signedIn: boolean;
  isFamily: boolean;
  booked?: boolean;
  autofocus?: boolean;
}) {
  const [state, formAction, pending] = useActionState<BookState, FormData>(createBookingAction, {});

  if (booked) {
    return <span className="xl-status">Booked ✓</span>;
  }

  if (remaining <= 0) {
    return <span className="xl-status">Full</span>;
  }

  if (!signedIn) {
    const callback = `/whats-on?book=${publicId}`;
    return (
      <Button size="sm" icon="arrow-up-right" href={`/login?callbackUrl=${encodeURIComponent(callback)}`}>
        Book
      </Button>
    );
  }

  if (!isFamily) {
    return <span className="xl-status">Family sign-in to book</span>;
  }

  return (
    <form action={formAction} className="xl-book">
      <input type="hidden" name="occurrencePublicId" value={publicId} />
      <label>
        Seats
        <input
          name="seats"
          type="number"
          inputMode="numeric"
          min={1}
          max={remaining}
          defaultValue={1}
          autoFocus={autofocus}
          className="xl-input"
        />
      </label>
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "Booking…" : "Book"}
      </Button>
      {state.error ? (
        <p role="alert" className="xl-error">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
