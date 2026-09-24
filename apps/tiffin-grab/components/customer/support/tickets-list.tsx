"use client";

import { MessageCircle } from "lucide-react";
import { formatEpoch } from "@/lib/format/datetime";
import type { CustomerTicketRow, TicketStatus } from "@/lib/services/tickets.service";
import { EmptyState, ListGroup, ListRow, Pill, Skeleton } from "@/components/customer/kit";
import { categoryLabel } from "@/lib/support/ticket-taxonomy";
import { STATUS_LABEL, STATUS_TONE } from "./parts";

export function TicketsList({ tickets, timezone }: { tickets: CustomerTicketRow[]; timezone: string }) {
  if (tickets.length === 0) {
    // No own CTA here — the header's "New ticket" (NewTicketControl) is the
    // page's one primary action; repeating it below would just be the same
    // button twice on an otherwise-empty screen.
    return (
      <EmptyState
        icon={<MessageCircle className="size-6" />}
        title="No tickets yet"
        body="If you run into a problem with a plan, delivery, or billing, let us know."
      />
    );
  }
  return (
    <nav aria-label="My tickets">
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
