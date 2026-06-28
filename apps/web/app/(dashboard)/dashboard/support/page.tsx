import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { LifeBuoyIcon, PlusIcon, MessageCircleIcon } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ticketsService, type TicketStatus } from "@/lib/services/tickets.service";
import { formatEpoch } from "@/lib/format/datetime";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, SectionCard, ListRow, EmptyState } from "@/components/ds";

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

export default async function SupportPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const [{ timezone }, [me]] = await Promise.all([
    getAppSettings(),
    db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1),
  ]);
  const tickets = me ? await ticketsService.listForCustomer(me.id) : [];

  return (
    <PageShell>
      <PageHeader
        icon={LifeBuoyIcon}
        title="Support"
        subtitle="Questions or something not right? Raise a ticket and we'll help."
        actions={
          <Button asChild>
            <Link href="/dashboard/support/new">
              <PlusIcon className="size-4" />
              New ticket
            </Link>
          </Button>
        }
      />

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
    </PageShell>
  );
}
