import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeftIcon, LifeBuoyIcon } from "lucide-react";
import { AuthError, ForbiddenError, NotFoundError } from "@realm/commons";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { attachmentHref } from "@/lib/services/ticket-attachments";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { TicketThread, TicketThreadSkeleton } from "@/components/customer/support/ticket-thread";

export default function TicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <div className="md:hidden">
        <Link
          href="/me/support"
          className="text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1 text-sm transition-colors"
        >
          <ChevronLeftIcon className="size-4" aria-hidden />
          Support
        </Link>
      </div>

      <Suspense fallback={<PageHeader icon={LifeBuoyIcon} title="Support ticket" />}>
        <TicketHeader params={params} />
      </Suspense>

      <SectionCard title="Conversation" subtitle="Replies from you and our support team.">
        <Suspense fallback={<TicketThreadSkeleton />}>
          <TicketThreadData params={params} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function TicketHeader({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  let ticket;
  try {
    ticket = await ticketsService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof AuthError) notFound();
    throw e;
  }

  return (
    <PageHeader
      icon={LifeBuoyIcon}
      title={ticket.subject}
      subtitle="Support ticket — reply below if you need to add more detail."
    />
  );
}

async function TicketThreadData({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  let ticket;
  let rawMessages;
  try {
    [ticket, rawMessages] = await Promise.all([
      ticketsService.read(id),
      ticketsService.listMessages(id),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof AuthError) notFound();
    throw e;
  }

  const { timezone } = await getAppSettings();

  const messages = await Promise.all(
    rawMessages.map(async (m) => ({
      ...m,
      attachments: m.attachments
        ? await Promise.all(
            m.attachments.map(async (a) => ({
              thumbUrl: a.thumbUrl,
              name: a.name,
              href: await attachmentHref(a),
            })),
          )
        : null,
    })),
  );

  return <TicketThread ticket={ticket} messages={messages} timezone={timezone} />;
}
