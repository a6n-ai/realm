"use client";

import { CheckCircle2, Clock, MessageCircleReply, Star, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Card, Textarea } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { rateTicket } from "@/app/(customer)/me/support/actions";
import type { TicketStatus } from "@/lib/services/tickets.service";

const BANNER: Record<TicketStatus, { icon: typeof Clock; title: string; body: string; tone: string }> = {
  open: { icon: Clock, title: "We got your message", body: "Our team will reply here soon.", tone: "bg-[var(--muted)]" },
  in_progress: { icon: Wrench, title: "We're on it", body: "Someone from our team is working on this.", tone: "bg-[var(--muted)]" },
  waiting_on_customer: {
    icon: MessageCircleReply,
    title: "Your reply needed",
    body: "We asked you something below. Reply so we can finish this.",
    tone: "bg-[color-mix(in_oklch,var(--s-hold,#f59e0b)_16%,transparent)]",
  },
  resolved: {
    icon: CheckCircle2,
    title: "Completed",
    body: "We've marked this chat as done. Still need help? Start a new ticket.",
    tone: "bg-[color-mix(in_oklch,var(--s-delivered-fg,#10b981)_16%,transparent)]",
  },
  closed: { icon: CheckCircle2, title: "Closed", body: "This chat is closed. Start a new ticket if you need anything.", tone: "bg-[var(--muted)]" },
};

/** What the chat's status means for the customer, in plain words. */
export function StatusBanner({ status }: { status: TicketStatus }) {
  const b = BANNER[status];
  return (
    <div role="status" className={cn(FONT, "flex items-start gap-3 rounded-2xl px-4 py-3", b.tone)}>
      <b.icon aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div>
        <p className="text-[15px] font-semibold">{b.title}</p>
        <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">{b.body}</p>
      </div>
    </div>
  );
}

const WORDS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

/** 1-5 stars + optional note, shown once the chat is completed. Re-rating replaces the old one. */
export function RateChat({ ticketId, rating, note }: { ticketId: string; rating: number | null; note: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(rating == null);
  const [stars, setStars] = useState(rating ?? 0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const shown = hover || stars;

  if (!editing && rating != null) {
    return (
      <Card className="flex flex-col gap-2 p-4">
        <p className="text-[15px] font-semibold">Thanks for rating this chat</p>
        <p className="flex items-center gap-1" aria-label={`${rating} out of 5 stars`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} aria-hidden className={cn("size-5", n <= rating ? "fill-[#f59e0b] text-[#f59e0b]" : "text-[var(--border)]")} />
          ))}
          <span className="ml-2 text-[13px] text-[var(--muted-foreground,#6E6558)]">{WORDS[rating]}</span>
        </p>
        {note ? <p className="text-[14px] text-[var(--muted-foreground,#6E6558)]">“{note}”</p> : null}
        <div>
          <Button variant="quiet" onClick={() => setEditing(true)}>Change rating</Button>
        </div>
      </Card>
    );
  }

  const submit = () => {
    if (stars < 1) return setError("Pick 1 to 5 stars");
    setError(null);
    start(async () => {
      const r = await rateTicket(ticketId, stars, text);
      if ("error" in r) return setError(r.error);
      setEditing(false);
      router.refresh();
    });
  };

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div>
        <p className="text-[15px] font-semibold">How did we do?</p>
        <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">Rate this chat. It helps us get better.</p>
      </div>
      <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}, ${WORDS[n]}`}
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            className={cn(FOCUS, "grid size-11 place-items-center rounded-full [touch-action:manipulation]")}
          >
            <Star aria-hidden className={cn("size-7 transition-colors", n <= shown ? "fill-[#f59e0b] text-[#f59e0b]" : "text-[var(--muted-foreground,#6E6558)]")} />
          </button>
        ))}
        <span className="ml-2 text-[14px] font-semibold" aria-live="polite">{shown ? WORDS[shown] : ""}</span>
      </div>
      <Textarea
        label="Anything to add? (optional)"
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
        placeholder="What went well, or what we could do better"
      />
      {error ? <p role="alert" className="text-[13px] text-[#be123c] dark:text-[#fda4af]">{error}</p> : null}
      <div className="flex gap-2">
        <Button variant="primary" pending={pending} onClick={submit}>Send rating</Button>
        {rating != null ? <Button variant="quiet" onClick={() => setEditing(false)}>Cancel</Button> : null}
      </div>
    </Card>
  );
}
