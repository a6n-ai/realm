import { cn } from "@realm/ui/cn";
import { formatEpoch } from "@/lib/format/datetime";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import type { TicketStatus } from "@/lib/services/tickets.service";
import { ReplyForm } from "./reply-form";

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

// Shared bubble geometry — the real thread and the skeleton twin both render
// from these, so the loading state can't drift from the component.
const bubbleWrap = (mine: boolean) =>
  cn("flex flex-col gap-1", mine ? "items-end" : "items-start");
const bubbleGeom = (mine: boolean) =>
  cn("max-w-[85%] rounded-2xl", mine ? "rounded-br-sm" : "rounded-bl-sm");
const bubbleBody = (mine: boolean) =>
  cn(
    bubbleGeom(mine),
    "px-3.5 py-2.5 text-sm",
    mine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground",
  );

type ThreadTicket = {
  publicId: string;
  status: string;
  category: string;
  createdAt: number;
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
        <Badge variant="outline">{CATEGORY_LABEL[ticket.category] ?? ticket.category}</Badge>
        <span className="text-muted-foreground text-xs">
          Opened {formatEpoch(ticket.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" })}
        </span>
      </div>

      <div className="space-y-3">
        {messages.map((m) => {
          if (m.authorType === "system") {
            return (
              <p key={m.publicId} className="text-muted-foreground text-center text-xs">
                {m.body} · {formatEpoch(m.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" })}
              </p>
            );
          }
          const mine = m.authorType === "customer";
          return (
            <div key={m.publicId} className={bubbleWrap(mine)}>
              <div className={bubbleBody(mine)}>
                <p className="whitespace-pre-wrap text-pretty">{m.body}</p>
              </div>
              <span className="text-muted-foreground text-xs">
                {mine ? "You" : "Support"} · {formatEpoch(m.createdAt, { timeZone: timezone, mode: "datetime", locale: "en-CA" })}
              </span>
            </div>
          );
        })}
      </div>

      <ReplyForm ticketId={ticket.publicId} closed={closed} />
    </div>
  );
}

// Exact loading twin: same header/bubble/reply layout, driven by the same
// bubbleWrap/bubbleBody geometry, with grey blocks where data goes.
const SKELETON_BUBBLES = [false, true, false, true, false, true];

TicketThread.Skeleton = function TicketThreadSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>

      <div className="space-y-3">
        {SKELETON_BUBBLES.map((mine, i) => (
          <div key={i} className={bubbleWrap(mine)}>
            <Skeleton className={cn(bubbleGeom(mine), "h-9 w-48")} />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-9 w-28" />
      </div>
    </div>
  );
};
