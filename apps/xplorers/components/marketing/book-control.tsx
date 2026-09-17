"use client";

import { useActionState } from "react";
import { XplButton } from "@/components/marketing/xpl-ui";
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
    return <span className="xpl-mono text-[11px] tracking-[0.1em]">Booked</span>;
  }

  if (remaining <= 0) {
    return <span className="xpl-mono text-[11px] tracking-[0.1em] text-[var(--graphite)]">Full</span>;
  }

  if (!signedIn) {
    const callback = `/whats-on?book=${publicId}`;
    return <XplButton href={`/login?callbackUrl=${encodeURIComponent(callback)}`}>Book</XplButton>;
  }

  if (!isFamily) {
    return <span className="xpl-mono text-[11px] tracking-[0.08em]">Family sign-in to book</span>;
  }

  return (
    <form action={formAction} className="flex flex-col items-stretch gap-2 lg:items-end">
      <input type="hidden" name="occurrencePublicId" value={publicId} />
      <label className="xpl-mono flex items-center gap-2 text-[11px] tracking-[0.08em]">
        Seats
        <input
          name="seats"
          type="number"
          min={1}
          max={remaining}
          defaultValue={1}
          autoFocus={autofocus}
          className="w-16 border border-[var(--rule)] bg-transparent px-2 py-1 text-[var(--ink)]"
        />
      </label>
      <XplButton type="submit" disabled={pending}>
        {pending ? "Booking…" : "Book"}
      </XplButton>
      {state.error ? (
        <p role="alert" className="m-0 max-w-[16ch] text-right text-sm text-[var(--blueprint)]">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
