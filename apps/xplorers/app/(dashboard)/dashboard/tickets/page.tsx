import { Suspense } from "react";
import Link from "next/link";
import { LifeBuoyIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireStaff } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { categoryLabel } from "@/lib/support/ticket-taxonomy";
import { formatSessionDay } from "@/lib/sessions/format";
import { STATUS_LABEL, STATUS_TONE } from "@/components/customer/support/parts";
import type { TicketStatus } from "@/lib/services/tickets.service";

export default function TicketsPage() {
  return (
    <PageShell>
      <PageHeader icon={LifeBuoyIcon} title="Tickets" subtitle="Customer support chats." />
      <SectionCard title="All tickets">
        <Suspense fallback={<TicketsSkeleton />}>
          <TicketsData />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function TicketsData() {
  await requireStaff();
  const [{ timezone }, rows] = await Promise.all([getAppClock(), ticketsService.listForStaff()]);

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No tickets yet.</p>;
  }

  return (
    <nav aria-label="Support tickets" className="divide-border divide-y">
      {rows.map((t) => {
        const status = t.status as TicketStatus;
        return (
          <Link
            key={t.publicId}
            href={`/dashboard/tickets/${t.publicId}`}
            prefetch={false}
            className="hover:bg-secondary/40 flex items-center justify-between gap-3 px-1 py-3.5 transition-colors"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold tracking-tight">{t.subject}</p>
              <p className="text-muted-foreground text-sm">
                {t.customerName ?? t.customerEmail} · {categoryLabel(t.category)} ·{" "}
                {formatSessionDay(new Date(t.updatedAt), timezone)}
              </p>
            </div>
            <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </Link>
        );
      })}
    </nav>
  );
}

function TicketsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-36" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
