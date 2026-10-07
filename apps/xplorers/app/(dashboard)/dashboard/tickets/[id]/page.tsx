import { Suspense, cache } from "react";
import { notFound } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { NotFoundError } from "@foundry/commons";
import {
  ChatMessageList,
  ChatMessageListSkeleton,
  PageHeader,
  PageShell,
  SectionCard,
  type ChatMessage,
} from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { requireStaff } from "@/lib/auth/guards";
import { getAppClock } from "@/lib/services/app-settings.service";
import { ticketsService, type TicketStatus } from "@/lib/services/tickets.service";
import { attachmentHref } from "@/lib/services/ticket-attachments";
import { categoryLabel, subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import { formatSessionDay } from "@/lib/sessions/format";
import { STATUS_LABEL, STATUS_TONE } from "@/components/customer/support/parts";
import { ReplyBox, ReplyBoxSkeleton, TicketControls, TicketControlsSkeleton } from "./ticket-controls";

const ensureStaff = cache(() => requireStaff());
const loadTicket = cache((id: string) => ticketsService.read(id));

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <Suspense fallback={<PageHeader icon={LifeBuoyIcon} title="Ticket" />}>
        <HeaderData params={params} />
      </Suspense>

      <SectionCard title="Details">
        <Suspense fallback={<DetailsFallback />}>
          <DetailsData params={params} />
        </Suspense>
      </SectionCard>

      <SectionCard title="Conversation">
        <Suspense fallback={<ConversationFallback />}>
          <ConversationData params={params} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function HeaderData({ params }: { params: Promise<{ id: string }> }) {
  await ensureStaff();
  const { id } = await params;
  let ticket;
  try {
    ticket = await loadTicket(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return <PageHeader icon={LifeBuoyIcon} title={ticket.subject} />;
}

async function DetailsData({ params }: { params: Promise<{ id: string }> }) {
  await ensureStaff();
  const { id } = await params;
  let ticket;
  try {
    ticket = await loadTicket(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { timezone } = await getAppClock();
  const status = ticket.status as TicketStatus;
  const sub = subcategoryLabel(ticket.category, ticket.subcategory);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
        <Badge variant="secondary">{categoryLabel(ticket.category)}</Badge>
        {sub ? <Badge variant="outline">{sub}</Badge> : null}
        <span className="text-muted-foreground text-sm">
          Opened {formatSessionDay(new Date(ticket.createdAt), timezone)}
        </span>
      </div>
      <TicketControls ticketId={ticket.publicId} status={status} />
    </div>
  );
}

async function ConversationData({ params }: { params: Promise<{ id: string }> }) {
  await ensureStaff();
  const { id } = await params;
  let ticket;
  let rawMessages;
  try {
    [ticket, rawMessages] = await Promise.all([
      loadTicket(id),
      ticketsService.listMessages(id),
    ]);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const { timezone } = await getAppClock();
  const closed = ticket.status === "resolved" || ticket.status === "closed";
  const channel = `ticket:${ticket.publicId}`;
  const fmt = (t: number) => formatSessionDay(new Date(t), timezone);

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

  return (
    <div className="space-y-4">
      <ChatMessageList
        className="space-y-3 pb-2"
        messages={messages.map(
          (m): ChatMessage => ({
            id: m.publicId,
            kind: m.authorType === "system" ? "system" : m.authorType === "staff" ? "mine" : "theirs",
            body: m.body,
            meta:
              m.authorType === "system"
                ? fmt(m.createdAt)
                : `${m.authorType === "staff" ? "You" : "Customer"} · ${fmt(m.createdAt)}`,
            attachments: m.attachments,
          }),
        )}
      />
      <ReplyBox ticketId={ticket.publicId} closed={closed} channel={channel} peerRole="customer" />
    </div>
  );
}

function DetailsFallback() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <TicketControlsSkeleton />
    </div>
  );
}

function ConversationFallback() {
  return (
    <div className="space-y-4">
      <ChatMessageListSkeleton />
      <ReplyBoxSkeleton />
    </div>
  );
}
