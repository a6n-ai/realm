"use client";

import { useEffect, useRef } from "react";
import { usePresence } from "@foundry/realtime/client";
import { Pill, Skeleton } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";
import { ChatMessageList, useMessageComposer, type ChatMessage, type ChatUi } from "@foundry/design-system";
import { categoryLabel, subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import { formatEpoch } from "@/lib/format/datetime";
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
  const fmt = (t: number) => formatEpoch(t, { timeZone: timezone, mode: "datetime", locale: "en-CA" });
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
        <p className="mb-3 text-center text-[12px] text-[var(--muted-foreground,#6E6558)]">Opened {fmt(ticket.createdAt)}</p>
        <div className="mt-auto">
          <ChatMessageList
            className="space-y-3"
            ui={kitChatUi}
            messages={messages.map((m): ChatMessage => ({
              id: m.publicId,
              kind: m.authorType === "system" ? "system" : m.authorType === "customer" ? "mine" : "theirs",
              body: m.body,
              meta: m.authorType === "system" ? fmt(m.createdAt) : `${m.authorType === "customer" ? "You" : "Support"} · ${fmt(m.createdAt)}`,
              attachments: m.attachments,
            }))}
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

const kitChatUi: Partial<ChatUi> = {
  System: ({ message: m }) => (
    <p className="text-center text-[13px] text-[var(--muted-foreground,#6E6558)]">
      {m.body} · {m.meta}
    </p>
  ),
  Bubble: ({ message: m, mine }) => (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-[20px] px-4 py-2.5 text-[15px] leading-snug sm:max-w-[75%]",
          mine ? "rounded-br-md bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "rounded-bl-md border border-[var(--border)] bg-[var(--card)]",
        )}
      >
        <p className="whitespace-pre-wrap text-pretty">{m.body}</p>
        {m.attachments?.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.attachments.map((a, i) => (
              <a key={i} href={a.href} target="_blank" rel="noreferrer" aria-label={`Open ${a.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.thumbUrl} alt={a.name} className="size-24 rounded-xl object-cover" />
              </a>
            ))}
          </div>
        ) : null}
      </div>
      <span className="px-1 text-[12px] text-[var(--muted-foreground,#6E6558)]">{m.meta}</span>
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
