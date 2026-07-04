import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { AuthError, ForbiddenError, NotFoundError } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ticketsService } from "@/lib/services/tickets.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { TicketThread } from "./ticket-thread";

export default function TicketThreadPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <PageHeader icon={LifeBuoyIcon} title="Support ticket" />

      <SectionCard title="Conversation">
        <Suspense fallback={<TicketThread.Skeleton />}>
          <TicketThreadData params={params} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function TicketThreadData({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  // read + listMessages both run the service trust boundary (a customer can only
  // see their own ticket). Anything other than a real, owned ticket → not-found.
  let ticket;
  let messages;
  try {
    [ticket, messages] = await Promise.all([
      ticketsService.read(id),
      ticketsService.listMessages(id),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError || e instanceof AuthError) notFound();
    throw e;
  }

  const { timezone } = await getAppSettings();

  return <TicketThread ticket={ticket} messages={messages} timezone={timezone} />;
}
