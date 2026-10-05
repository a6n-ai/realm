"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/marketing/ui";
import {
  createBookingAction,
  quoteBookingAction,
  type BookState,
  type QuoteState,
} from "@/app/(marketing)/whats-on/actions";

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

  return <FamilyBookForm publicId={publicId} remaining={remaining} autofocus={autofocus} />;
}

function money(n: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
}

function FamilyBookForm({ publicId, remaining, autofocus }: { publicId: string; remaining: number; autofocus?: boolean }) {
  const [state, formAction, pending] = useActionState<BookState, FormData>(createBookingAction, {});
  const [seats, setSeats] = useState(1);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<QuoteState>({});
  const [quoting, startQuote] = useTransition();

  const apply = () => startQuote(async () => setPreview(await quoteBookingAction(publicId, seats, code)));
  const quote = preview.quote;

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
          value={seats}
          onChange={(e) => {
            setSeats(Number(e.target.value) || 1);
            setPreview({});
          }}
          autoFocus={autofocus}
          className="xl-input"
        />
      </label>
      <label>
        Code
        <input
          name="code"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setPreview({});
          }}
          autoCapitalize="characters"
          autoComplete="off"
          placeholder="Optional"
          className="xl-input xl-input-code"
        />
      </label>
      <Button size="sm" variant="secondary" onClick={apply} disabled={quoting}>
        {quoting ? "Checking…" : "See price"}
      </Button>
      {quote ? (
        <dl className="xl-quote">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(quote.subtotal, quote.currency)}</dd>
          </div>
          {quote.adjustments.map((a) => (
            <div key={a.kind + a.publicId}>
              <dt>{a.code ?? a.name}</dt>
              <dd>−{money(a.amount, quote.currency)}</dd>
            </div>
          ))}
          {quote.taxTotal > 0 ? (
            <div>
              <dt>Tax</dt>
              <dd>{money(quote.taxTotal, quote.currency)}</dd>
            </div>
          ) : null}
          <div>
            <dt>Total</dt>
            <dd>{quote.total === 0 ? "Free" : money(quote.total, quote.currency)}</dd>
          </div>
        </dl>
      ) : null}
      {preview.codeMessage ? <p className="xl-hint">{preview.codeMessage}</p> : null}
      {preview.error ? (
        <p role="alert" className="xl-error">
          {preview.error}
        </p>
      ) : null}
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
