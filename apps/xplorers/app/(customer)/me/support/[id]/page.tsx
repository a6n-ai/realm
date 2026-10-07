import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AuthError, ForbiddenError, NotFoundError } from "@foundry/commons";
import { LifeBuoyIcon } from "lucide-react";
import { BackButton, PageHeader, PageShell } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { getAppClock } from "@/lib/services/app-settings.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { attachmentHref } from "@/lib/services/ticket-attachments";
import { TicketThread, TicketThreadSkeleton } from "@/components/customer/support/ticket-thread";

export default function TicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <BackButton href="/me/support" label="Support" />
      <Suspense fallback={<PageHeader icon={LifeBuoyIcon} title="Support ticket" />}>
        <TicketHeader params={params} />
      </Suspense>
      <Suspense fallback={<TicketThreadSkeleton />}>
        <TicketThreadData params={params} />
      </Suspense>
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
    await ticketsService.assertReadable(id);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof AuthError) notFound();
    throw e;
  }

  return (
    <PageHeader
      icon={LifeBuoyIcon}
      title={ticket.subject}
      subtitle="Reply below if you need to add more detail."
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

  const { timezone } = await getAppClock();
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
