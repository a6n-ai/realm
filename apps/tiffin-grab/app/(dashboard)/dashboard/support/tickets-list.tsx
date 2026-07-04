import Link from "next/link";
import { MessageCircleIcon, PlusIcon } from "lucide-react";
import { formatEpoch } from "@/lib/format/datetime";
import type { CustomerTicketRow, TicketStatus } from "@/lib/services/tickets.service";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, ListRow, EmptyState } from "@/components/ds";

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

export function TicketsList({ tickets, timezone }: { tickets: CustomerTicketRow[]; timezone: string }) {
  return (
    <SectionCard title="My tickets" subtitle={tickets.length === 0 ? "Nothing yet" : undefined}>
      {tickets.length === 0 ? (
        <EmptyState
          icon={MessageCircleIcon}
          message="You haven't raised any tickets. If you run into a problem with an order or your account, let us know."
          action={
            <Button asChild>
              <Link href="/dashboard/support/new">
                <PlusIcon className="size-4" />
                New ticket
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const status = t.status as TicketStatus;
            return (
              <ListRow
                key={t.publicId}
                href={`/dashboard/support/${t.publicId}`}
                title={t.subject}
                meta={`${CATEGORY_LABEL[t.category] ?? t.category} · ${formatEpoch(t.createdAt, { timeZone: timezone, mode: "date", locale: "en-CA" })}`}
                trailing={<Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>}
              />
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

export function TicketsListSkeleton() {
  return (
    <SectionCard title="My tickets">
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <ListRow
            key={i}
            title={<Skeleton className="h-4 w-40" />}
            meta={<Skeleton className="h-3 w-28" />}
            trailing={<Skeleton className="h-5 w-16 rounded-full" />}
          />
        ))}
      </div>
    </SectionCard>
  );
};
