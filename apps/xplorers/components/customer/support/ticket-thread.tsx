"use client";

import { usePresence } from "@foundry/realtime/client";
import { ChatMessageList, useMessageComposer, type ChatMessage, type ChatUi } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { cn } from "@foundry/ui/cn";
import { categoryLabel, subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import { formatSessionDay } from "@/lib/sessions/format";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { replyTicket } from "@/app/(customer)/me/support/actions";
import { STATUS_LABEL, STATUS_TONE } from "./parts";
import { ChatComposer } from "@/components/support/chat-composer";

type ThreadTicket = {
  publicId: string;
  status: string;
  category: string;
  subcategory?: string | null;
  createdAt: number;
  subject?: string;
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
}: {
  ticket: ThreadTicket;
  messages: ThreadMessage[];
  timezone: string;
}) {
  const status = ticket.status as TicketStatus;
  const closed = status === "resolved" || status === "closed";
  const channel = `ticket:${ticket.publicId}`;
  const supportOnline = usePresence(channel, "staff");
  const fmt = (t: number) => formatSessionDay(new Date(t), timezone);
  const sub = subcategoryLabel(ticket.category, ticket.subcategory ?? null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        <Badge variant="outline">{categoryLabel(ticket.category)}</Badge>
        {sub ? <Badge variant="outline">{sub}</Badge> : null}
        <span className="text-muted-foreground text-sm">Opened {fmt(ticket.createdAt)}</span>
        <span aria-live="polite" className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          <span
            aria-hidden
            className={cn("size-2 rounded-full", supportOnline ? "bg-emerald-500" : "bg-border")}
          />
          Support {supportOnline ? "online" : "offline"}
        </span>
      </div>

      <ChatMessageList
        className="space-y-3 pb-2"
        ui={kitChatUi}
        messages={messages.map(
          (m): ChatMessage => ({
            id: m.publicId,
            kind: m.authorType === "system" ? "system" : m.authorType === "customer" ? "mine" : "theirs",
            body: m.body,
            meta:
              m.authorType === "system"
                ? fmt(m.createdAt)
                : `${m.authorType === "customer" ? "You" : "Support"} · ${fmt(m.createdAt)}`,
            attachments: m.attachments,
          }),
        )}
      />

      <div className="bg-background/95 sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 -mx-4 border-t px-4 py-3 backdrop-blur-sm lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Composer ticketId={ticket.publicId} closed={closed} channel={channel} />
      </div>
    </div>
  );
}

function Composer({ ticketId, closed, channel }: { ticketId: string; closed: boolean; channel: string }) {
  const c = useMessageComposer({ action: (form) => replyTicket(ticketId, form), channel, peerRole: "staff" });

  if (closed) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
        This ticket is closed. Staff can reopen it to continue the conversation.
      </p>
    );
  }

  return <ChatComposer composer={c} placeholder="Write a message…" typingLabel="Support is typing…" />;
}

const kitChatUi: Partial<ChatUi> = {
  System: ({ message: m }) => (
    <p className="text-muted-foreground text-center text-sm">
      {m.body} · {m.meta}
    </p>
  ),
  Bubble: ({ message: m, mine }) => (
    <div className={cn("flex flex-col gap-1", mine ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[88%] rounded-[20px] px-4 py-2.5 text-[15px] leading-snug sm:max-w-[75%]",
          mine
            ? "bg-primary text-primary-foreground rounded-br-md"
            : "bg-card rounded-bl-md border",
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
      <span className="text-muted-foreground px-1 text-xs">{m.meta}</span>
    </div>
  ),
};

export function TicketThreadSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-16 w-3/4 rounded-2xl" />
      ))}
      <Skeleton className="h-14 w-full rounded-full" />
    </div>
  );
}
