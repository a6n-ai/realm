"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePresence } from "@foundry/realtime/client";
import { IconTile, Pill, Skeleton } from "@/components/customer/kit";
import { cn, FONT } from "@/components/customer/kit/cn";
import { ChatMessageList, useMessageComposer, type ChatMessage, type ChatUi } from "@foundry/design-system";
import { categoryLabel, subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { replyTicket } from "@/app/(customer)/me/support/actions";
import { STATUS_LABEL, STATUS_TONE } from "./parts";
import { ChatComposer } from "@/components/support/chat-composer";
import { useMarkTicketSeen } from "./unread";
import { RateChat, StatusBanner } from "./ticket-status";
import { withDayChips } from "@/lib/support/chat-days";
import { topicFor } from "./topics";
import { Bubble as UiBubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";

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

export function TicketThread({
  ticket,
  messages,
  timezone,
  hours = null,
}: {
  ticket: ThreadTicket;
  messages: ThreadMessage[];
  timezone: string;
  /** Support hours line, rendered by the server page; hidden once the chat is completed. */
  hours?: ReactNode;
}) {
  const status = ticket.status as TicketStatus;
  const closed = status === "resolved" || status === "closed";
  const channel = `ticket:${ticket.publicId}`;
  const supportOnline = usePresence(channel, "staff");
  useMarkTicketSeen(ticket.publicId, messages.reduce((n, m) => Math.max(n, m.createdAt), 0));
  const sub = subcategoryLabel(ticket.category, ticket.subcategory ?? null);
  const topic = topicFor(ticket.category);
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
      {/* One meta line, like a Messages header: the topic's tile, what it's about, where it stands. */}
      <div className="flex shrink-0 items-center gap-2.5">
        <IconTile tint={topic.tint}><topic.icon /></IconTile>
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">
          {categoryLabel(ticket.category)}
          {sub ? <span className="font-normal text-[var(--muted-foreground,#6E6558)]"> · {sub}</span> : null}
        </p>
        <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>
      </div>

      <div className="shrink-0 space-y-2">
        <StatusBanner status={status} />
        {/* Someone on the team in this chat right now beats the posted hours; otherwise the hours say when. */}
        {closed ? null : supportOnline ? (
          <p aria-live="polite" className="flex items-center gap-2 text-[13px] text-[var(--muted-foreground,#6E6558)]">
            <span aria-hidden className="size-2 rounded-full bg-[var(--s-delivered-fg)]" />
            <span><span className="font-semibold text-[var(--foreground)]">Support is online now.</span> Replies come in here.</span>
          </p>
        ) : hours}
      </div>

      {/* The chat window: the one scrolling part. Short chats sit at its bottom, like a chat app. */}
      <div ref={paneRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-1 py-2">
        <div className="mt-auto">
          <ChatMessageList
            className="space-y-2"
            ui={kitChatUi}
            messages={withDayChips(messages, timezone, (m, time) => ({
              id: m.publicId,
              kind: m.authorType === "system" ? "system" : m.authorType === "customer" ? "mine" : "theirs",
              body: m.body,
              meta: time,
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
    return <p className="c-surface rounded-2xl bg-[var(--card)] p-4 text-[15px] text-[var(--muted-foreground,#6E6558)]">This chat is completed. Need more help? Start a new ticket from Support.</p>;
  }

  return <ChatComposer composer={c} placeholder="Write a message…" typingLabel="Support is typing…" shellClassName="c-liquid border mr-[calc(0.5rem+58px)] lg:mr-0" />;
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
  // ReUI/shadcn Message + Bubble: the row aligns by sender, the bubble carries the colour (yours saffron,
  // the team's muted), shaped like iMessage with the time tucked into its corner.
  Bubble: ({ message: m, mine }) => (
    <Message align={mine ? "end" : "start"}>
      <MessageContent>
        <UiBubble variant={mine ? "default" : "muted"} align={mine ? "end" : "start"} className="sm:max-w-[70%]">
          <BubbleContent className={cn("rounded-[20px] px-3.5 py-2 text-[15px] leading-snug", mine ? "rounded-br-md" : "rounded-bl-md")}>
            <p className="whitespace-pre-wrap text-pretty">
              {m.body}
              <span className={cn("float-right mt-1.5 ml-2 text-[10px] leading-none", mine ? "text-[var(--primary-foreground,#fff)]/75" : "text-[var(--muted-foreground,#6E6558)]")}>{m.meta}</span>
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
          </BubbleContent>
        </UiBubble>
      </MessageContent>
    </Message>
  ),
};

/** Mirrors TicketThread: meta row (topic tile, title, status pill), status banner, hours line, bubbles on the page, glass composer capsule. */
export function TicketThreadSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" aria-hidden>
      <div className="flex shrink-0 items-center gap-2.5">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <Skeleton className="h-[22px] w-40 flex-1 max-w-[12rem]" />
        <Skeleton className="ml-auto h-7 w-16 rounded-full" />
      </div>
      <div className="shrink-0 space-y-2">
        <div className="flex items-start gap-3 rounded-2xl bg-[var(--muted)] px-4 py-3">
          <Skeleton className="mt-0.5 size-5 shrink-0 rounded-full bg-[var(--border)]" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-[22px] w-40 bg-[var(--border)]" />
            <Skeleton className="h-[18px] w-3/4 bg-[var(--border)]" />
          </div>
        </div>
        <Skeleton className="h-[18px] w-64 max-w-full" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-1 py-2">
        {[false, true, false].map((mine, i) => (
          <div key={i} className={cn("flex", mine && "justify-end")}>
            <Skeleton className={cn("h-11 w-56 max-w-[70%] rounded-[20px]", mine ? "rounded-br-md" : "rounded-bl-md")} />
          </div>
        ))}
      </div>
      <div className="c-liquid mr-[calc(0.5rem+58px)] flex shrink-0 items-center gap-1.5 rounded-full p-1.5 lg:mr-0">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <Skeleton className="h-10 flex-1 rounded-full" />
        <Skeleton className="size-10 shrink-0 rounded-full" />
      </div>
    </div>
  );
}
