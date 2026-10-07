"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatMessageList, type ChatMessage } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Textarea } from "@foundry/ui/textarea";
import { Skeleton } from "@foundry/ui/skeleton";
import { categoryLabel, subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import { formatSessionDay } from "@/lib/sessions/format";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { replyTicket } from "@/app/(customer)/me/support/actions";
import { STATUS_LABEL, STATUS_TONE } from "./parts";

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
  const fmt = (t: number) => formatSessionDay(new Date(t), timezone);
  const sub = subcategoryLabel(ticket.category, ticket.subcategory ?? null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        <Badge variant="outline">{categoryLabel(ticket.category)}</Badge>
        {sub ? <Badge variant="outline">{sub}</Badge> : null}
        <span className="text-muted-foreground text-sm">Opened {fmt(ticket.createdAt)}</span>
      </div>

      <ChatMessageList
        className="space-y-3 pb-2"
        messages={messages.map(
          (m): ChatMessage => ({
            id: m.publicId,
            kind: m.authorType === "system" ? "system" : m.authorType === "customer" ? "mine" : "theirs",
            body: m.body,
            meta:
              m.authorType === "system"
                ? fmt(m.createdAt)
                : `${m.authorType === "customer" ? "You" : "Support"} · ${fmt(m.createdAt)}`,
          }),
        )}
      />

      <Composer ticketId={ticket.publicId} closed={closed} />
    </div>
  );
}

function Composer({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (closed) {
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
        This ticket is closed. Staff can reopen it to continue the conversation.
      </p>
    );
  }

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return setError("Type a message.");
    setError(null);
    start(async () => {
      try {
        const form = new FormData();
        form.set("body", trimmed);
        await replyTicket(ticketId, form);
        setBody("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't send your reply.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        placeholder="Write a message…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
      />
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" onClick={submit} disabled={pending}>
        {pending ? "Sending…" : "Send reply"}
      </Button>
    </div>
  );
}

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
    </div>
  );
}
