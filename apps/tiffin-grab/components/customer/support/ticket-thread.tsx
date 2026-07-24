"use client";

import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import {
  ChatMessageList,
  ChatMessageListSkeleton,
  MessageComposer,
  PresenceDot,
  type ChatMessage,
} from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { replyTicket } from "@/app/(customer)/me/support/actions";

const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  waiting_on_customer: "Your reply needed",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_VARIANT: Record<TicketStatus, "default" | "secondary" | "outline"> = {
  open: "default",
  in_progress: "default",
  waiting_on_customer: "default",
  resolved: "secondary",
  closed: "outline",
};

const CATEGORY_LABEL: Record<string, string> = {
  order: "Order",
  billing: "Billing",
  catering: "Catering",
  general: "General",
};

type ThreadTicket = {
  publicId: string;
  status: string;
  category: string;
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

  const chatMessages: ChatMessage[] = messages.map((m) => {
    const when = formatEpoch(m.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" });
    if (m.authorType === "system") {
      return { id: m.publicId, kind: "system", body: m.body, meta: when };
    }
    const mine = m.authorType === "customer";
    return {
      id: m.publicId,
      kind: mine ? "mine" : "theirs",
      body: m.body,
      meta: `${mine ? "You" : "Support"} · ${when}`,
      attachments: m.attachments,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        <Badge variant="outline">{CATEGORY_LABEL[ticket.category] ?? ticket.category}</Badge>
        <span className="text-muted-foreground text-xs">
          Opened {formatEpoch(ticket.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" })}
        </span>
        <PresenceDot channel={channel} peerRole="staff" label="Support" />
      </div>

      <ChatMessageList messages={chatMessages} className="pb-2" />

      <div className="bg-background sticky bottom-20 z-10 -mx-1 border-t pt-3 md:static md:bottom-auto md:border-0 md:pt-0">
        <MessageComposer
          action={replyTicket.bind(null, ticket.publicId)}
          closed={closed}
          channel={channel}
          peerRole="staff"
          closedMessage="This ticket is closed. Staff can reopen it to continue the conversation."
        />
      </div>
    </div>
  );
}

export function TicketThreadSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <ChatMessageListSkeleton />
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-11 w-28" />
      </div>
    </div>
  );
}
