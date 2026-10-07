"use client";

import { MessageCircle } from "lucide-react";
import { formatEpoch } from "@/lib/format/datetime";
import type { CustomerTicketRow, TicketStatus } from "@/lib/services/tickets.service";
import { EmptyState, ListGroup, ListRow, Pill, Skeleton } from "@/components/customer/kit";
import { categoryLabel } from "@/lib/support/ticket-taxonomy";
import { STATUS_LABEL, STATUS_TONE } from "./parts";

const DONE = new Set<string>(["resolved", "closed"]);

function TicketSection({ title, hint, tickets, timezone, empty }: { title: string; hint: string; tickets: CustomerTicketRow[]; timezone: string; empty: string }) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <p className="text-[13px] text-[var(--muted-foreground,#6E6558)]">{hint}</p>
        </div>
        {tickets.length > 0 ? <span className="text-[13px] font-semibold tabular-nums text-[var(--muted-foreground,#6E6558)]">{tickets.length}</span> : null}
      </div>
      {tickets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-5 text-[14px] text-[var(--muted-foreground,#6E6558)]">{empty}</p>
      ) : (
        <ListGroup>
          {tickets.map((t) => {
            const status = t.status as TicketStatus;
            return (
              <ListRow
                key={t.publicId}
                href={`/me/support/${t.publicId}`}
                label={t.subject}
                sublabel={`${categoryLabel(t.category)} · ${formatEpoch(t.createdAt, { timeZone: timezone, mode: "date", locale: "en-CA" })}`}
                value={<Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>}
              />
            );
          })}
        </ListGroup>
      )}
    </section>
  );
}

export function TicketsList({ tickets, timezone }: { tickets: CustomerTicketRow[]; timezone: string }) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircle className="size-6" />}
        title="No chats yet"
        body="Pick a topic above or tap New ticket, and we'll reply here."
      />
    );
  }
  return (
    <nav aria-label="My chats" className="space-y-6">
      <TicketSection title="Current chats" hint="Still open with our team." tickets={tickets.filter((t) => !DONE.has(t.status))} timezone={timezone} empty="Nothing open right now." />
      <TicketSection title="History" hint="Completed and closed chats." tickets={tickets.filter((t) => DONE.has(t.status))} timezone={timezone} empty="No past chats yet." />
    </nav>
  );
}

export function TicketsListSkeleton() {
  return (
    <ListGroup>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex min-h-14 items-center gap-3 px-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-7 w-16 rounded-full" />
        </div>
      ))}
    </ListGroup>
  );
}
