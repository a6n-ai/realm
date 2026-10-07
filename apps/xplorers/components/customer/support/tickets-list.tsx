"use client";

import Link from "next/link";
import { ArchiveIcon, MessageCircleIcon } from "lucide-react";
import { EmptyState } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { categoryLabel } from "@/lib/support/ticket-taxonomy";
import type { CustomerTicketRow, TicketStatus } from "@/lib/services/tickets.service";
import { formatSessionDay } from "@/lib/sessions/format";
import { STATUS_LABEL, STATUS_TONE } from "./parts";

const ACTIVE: TicketStatus[] = ["open", "in_progress", "waiting_on_customer"];
const HISTORY: TicketStatus[] = ["resolved", "closed"];

function isActive(status: string): status is TicketStatus {
  return (ACTIVE as string[]).includes(status);
}

function TicketRow({ ticket, timezone }: { ticket: CustomerTicketRow; timezone: string }) {
  const status = ticket.status as TicketStatus;
  return (
    <Link
      href={`/me/support/${ticket.publicId}`}
      prefetch={false}
      className="hover:bg-secondary/40 flex items-center justify-between gap-3 px-4 py-3.5 transition-[background-color,transform] duration-150 ease-out active:scale-[0.995]"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold tracking-tight">{ticket.subject}</p>
        <p className="text-muted-foreground text-sm">
          {categoryLabel(ticket.category)} · {formatSessionDay(new Date(ticket.createdAt), timezone)}
        </p>
      </div>
      <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
    </Link>
  );
}

function TicketSection({
  title,
  hint,
  emptyIcon: Icon,
  emptyMessage,
  tickets,
  timezone,
}: {
  title: string;
  hint: string;
  emptyIcon: typeof MessageCircleIcon;
  emptyMessage: string;
  tickets: CustomerTicketRow[];
  timezone: string;
}) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
          <p className="text-muted-foreground text-sm">{hint}</p>
        </div>
        {tickets.length > 0 ? (
          <span className="text-muted-foreground text-sm font-semibold tabular-nums">{tickets.length}</span>
        ) : null}
      </div>
      {tickets.length === 0 ? (
        <div className="border-border bg-card rounded-[18px] border px-4 py-8">
          <EmptyState icon={Icon} message={emptyMessage} />
        </div>
      ) : (
        <nav className="bg-card divide-border divide-y overflow-hidden rounded-[18px] border">
          {tickets.map((t) => (
            <TicketRow key={t.publicId} ticket={t} timezone={timezone} />
          ))}
        </nav>
      )}
    </section>
  );
}

export function TicketsList({ tickets, timezone }: { tickets: CustomerTicketRow[]; timezone: string }) {
  const current = tickets.filter((t) => isActive(t.status));
  const history = tickets.filter((t) => (HISTORY as string[]).includes(t.status));

  return (
    <div className="space-y-8">
      <TicketSection
        title="Current chats"
        hint="Open threads waiting on you or our team."
        emptyIcon={MessageCircleIcon}
        emptyMessage="No open chats yet. Tap New ticket or a topic above."
        tickets={current}
        timezone={timezone}
      />
      <TicketSection
        title="History"
        hint="Resolved and closed tickets."
        emptyIcon={ArchiveIcon}
        emptyMessage="No past tickets yet."
        tickets={history}
        timezone={timezone}
      />
    </div>
  );
}

export function TicketsListSkeleton() {
  return (
    <div className="space-y-8">
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-52" />
          <div className="divide-border divide-y rounded-[18px] border">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
