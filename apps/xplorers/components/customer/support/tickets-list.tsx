"use client";

import Link from "next/link";
import { MessageCircleIcon } from "lucide-react";
import { EmptyState } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { categoryLabel } from "@/lib/support/ticket-taxonomy";
import type { CustomerTicketRow, TicketStatus } from "@/lib/services/tickets.service";
import { formatSessionDay } from "@/lib/sessions/format";
import { STATUS_LABEL, STATUS_TONE } from "./parts";

export function TicketsList({ tickets, timezone }: { tickets: CustomerTicketRow[]; timezone: string }) {
  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={MessageCircleIcon}
        message="No tickets yet. If something goes wrong with a booking or payment, raise a ticket and we'll help."
      />
    );
  }

  return (
    <nav aria-label="My tickets" className="bg-card divide-border divide-y overflow-hidden rounded-[18px] border">
      {tickets.map((t) => {
        const status = t.status as TicketStatus;
        return (
          <Link
            key={t.publicId}
            href={`/me/support/${t.publicId}`}
            prefetch={false}
            className="hover:bg-secondary/40 flex items-center justify-between gap-3 px-4 py-3.5 transition-[background-color,transform] duration-150 ease-out active:scale-[0.995]"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-tight">{t.subject}</p>
              <p className="text-muted-foreground text-sm">
                {categoryLabel(t.category)} · {formatSessionDay(new Date(t.createdAt), timezone)}
              </p>
            </div>
            <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </Link>
        );
      })}
    </nav>
  );
}

export function TicketsListSkeleton() {
  return (
    <div className="divide-border divide-y rounded-xl border">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
