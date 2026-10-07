import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { AuthError, ForbiddenError, NotFoundError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { attachmentHref } from "@/lib/services/ticket-attachments";
import { PageHeader } from "@/components/customer/kit";
import { BackLink } from "@/components/customer/support/parts";
import { TicketThread, TicketThreadSkeleton } from "@/components/customer/support/ticket-thread";

export default function TicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    // Fills the screen between the app header and the tab bar (desktop: the page padding), so the
    // heading stays put and only the chat window scrolls. 177px = header 64 (+1 border) + main pt 16 + main pb 96.
    <div className="mx-auto flex h-[calc(100dvh-177px-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-w-2xl flex-col gap-3 lg:h-[calc(100dvh-129px)]">
      <div className="shrink-0">
        <BackLink href="/me/support" label="Support" />
        <Suspense fallback={<PageHeader eyebrow="Support ticket" title="Support ticket" />}>
          <TicketHeader params={params} />
        </Suspense>
      </div>
      <Suspense fallback={<TicketThreadSkeleton />}>
        <TicketThreadData params={params} />
      </Suspense>
    </div>
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
    <PageHeader eyebrow="Support ticket" title={ticket.subject} />
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
