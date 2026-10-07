"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "@foundry/realtime/client";
import { Pill, Skeleton } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";
import { ChatMessageList, useMessageComposer, type ChatMessage, type ChatUi } from "@foundry/design-system";
import { categoryLabel, subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { replyTicket } from "@/app/(customer)/me/support/actions";
import { STATUS_LABEL, STATUS_TONE } from "./parts";
import { ChatComposer } from "@/components/support/chat-composer";
import { useMarkTicketSeen } from "./unread";
import { RateChat, StatusBanner } from "./ticket-status";

type ThreadTicket = {
  publicId: string;
  status: string;
  category: string;
  subcategory?: string | null;
  createdAt: number;
  subject?: string;
  rating?: number | null;
  ratingNote?: string | null;
};

type ThreadMessage = {
  publicId: string;
  authorType: string;
  body: string;
  createdAt: number;
  attachments?: { thumbUrl: string; name: string; href: string }[] | null;
};

export function TicketThread({ ticket, messages, timezone }: { ticket: ThreadTicket; messages: ThreadMessage[]; timezone: string }) {
  const status = ticket.status as TicketStatus;
  const closed = status === "resolved" || status === "closed";
  const channel = `ticket:${ticket.publicId}`;
  const supportOnline = usePresence(channel, "staff");
  useMarkTicketSeen(ticket.publicId, messages.reduce((n, m) => Math.max(n, m.createdAt), 0));
  const sub = subcategoryLabel(ticket.category, ticket.subcategory ?? null);
  // Like a chat app: only the message pane scrolls; it opens at the newest message and follows new ones.
  const paneRef = useRef<HTMLDivElement>(null);
  const last = messages.at(-1)?.publicId;
  const seen = useRef<string | undefined>(undefined);
  useEffect(() => {
    const pane = paneRef.current;
    if (pane) pane.scrollTo({ top: pane.scrollHeight, behavior: seen.current ? "smooth" : "instant" });
    seen.current = last;
  }, [last]);

  return (
    <div className={cn(FONT, "flex min-h-0 flex-1 flex-col gap-3")}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
        <Pill>{categoryLabel(ticket.category)}</Pill>
        {sub ? <Pill>{sub}</Pill> : null}
        <span aria-live="polite" className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted-foreground,#6E6558)]">
          <span aria-hidden className={cn("size-2 rounded-full", supportOnline ? "bg-[var(--s-delivered-fg)]" : "bg-[var(--border)]")} />
          Support {supportOnline ? "online" : "offline"}
        </span>
      </div>

      <div className="shrink-0">
        <StatusBanner status={status} />
      </div>

      {/* The chat window: the one scrolling part. Short chats sit at its bottom, like a chat app. */}
      <div ref={paneRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] px-3 py-3">
        <div className="mt-auto">
          <ChatMessageList
            className="space-y-2"
            ui={kitChatUi}
            messages={chatItems(messages, timezone)}
          />
          {closed && (
            <div className="mt-4">
              <RateChat ticketId={ticket.publicId} rating={ticket.rating ?? null} note={ticket.ratingNote ?? null} />
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0">
        <Composer ticketId={ticket.publicId} closed={closed} channel={channel} />
      </div>
    </div>
  );
}

function Composer({ ticketId, closed, channel }: { ticketId: string; closed: boolean; channel: string }) {
  const c = useMessageComposer({ action: (form) => replyTicket(ticketId, form), channel, peerRole: "staff" });

  if (closed) {
    return <p className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-[15px] text-[var(--muted-foreground,#6E6558)]">This chat is completed. Need more help? Start a new ticket from Support.</p>;
  }

  return <ChatComposer composer={c} placeholder="Write a message…" typingLabel="Support is typing…" />;
}

const dayKey = (t: number, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(t);
const timeOf = (t: number, tz: string) => new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(t).toLowerCase();

/** "Today", "Yesterday", else "Mon, Oct 5" (with the year when it isn't this year). */
function dayLabel(t: number, tz: string): string {
  const now = Date.now();
  const key = dayKey(t, tz);
  if (key === dayKey(now, tz)) return "Today";
  if (key === dayKey(now - 864e5, tz)) return "Yesterday";
  const sameYear = key.slice(0, 4) === dayKey(now, tz).slice(0, 4);
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(t);
}

/** WhatsApp-style: a date chip wherever the day changes, and only the time on each message. */
function chatItems(messages: ThreadMessage[], tz: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  let prev = "";
  for (const m of messages) {
    const key = dayKey(m.createdAt, tz);
    if (key !== prev) {
      out.push({ id: `day:${key}`, kind: "system", body: dayLabel(m.createdAt, tz), meta: "" });
      prev = key;
    }
    out.push({
      id: m.publicId,
      kind: m.authorType === "system" ? "system" : m.authorType === "customer" ? "mine" : "theirs",
      body: m.body,
      meta: timeOf(m.createdAt, tz),
      attachments: m.attachments,
    });
  }
  return out;
}

const kitChatUi: Partial<ChatUi> = {
  System: ({ message: m }) =>
    m.meta ? (
      <p className="text-center text-[11px] text-[var(--muted-foreground,#6E6558)]">
        {m.body} · {m.meta}
      </p>
    ) : (
      <p className="flex justify-center py-1">
        <span className="rounded-full bg-[var(--muted)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--muted-foreground,#6E6558)]">{m.body}</span>
      </p>
    ),
  Bubble: ({ message: m, mine }) => (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-1.5 text-[14px] leading-snug sm:max-w-[70%]",
          mine ? "rounded-br-sm bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "rounded-bl-sm border border-[var(--border)] bg-[var(--card)]",
        )}
      >
        <p className="whitespace-pre-wrap text-pretty">
          {m.body}
          {/* Time tucked into the bubble's corner, like WhatsApp. */}
          <span className={cn("float-right ml-2 mt-1.5 text-[10px] leading-none", mine ? "text-[var(--primary-foreground,#fff)]/75" : "text-[var(--muted-foreground,#6E6558)]")}>{m.meta}</span>
        </p>
        {m.attachments?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.attachments.map((a, i) => (
              <a key={i} href={a.href} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbUrl} alt={a.name} className="size-20 rounded-lg object-cover" />
              </a>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  ),
};

export function TicketThreadSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-16 rounded-full" />
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>
      {[false, true, false].map((mine, i) => (
        <div key={i} className={cn("flex", mine && "justify-end")}>
          <Skeleton className="h-12 w-56" />
        </div>
      ))}
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
