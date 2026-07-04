import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { inArray } from "drizzle-orm";
import { NotFoundError } from "@tiffin/commons";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { formatEpoch } from "@/lib/format/datetime";
import { requireStaff } from "@/lib/auth/guards";
import {
  ticketsService,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/services/tickets.service";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { cn } from "@/lib/utils";
import { TicketStatusBadge, PriorityBadge, CATEGORY_LABEL } from "../ticket-badges";
import { TicketControls, ReplyBox } from "./ticket-controls";

const AUTHOR_LABEL: Record<string, string> = {
  customer: "Customer",
  staff: "Staff",
  system: "System",
};

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
  await requireStaff();
  const { id } = await params;

  let ticket;
  try {
    ticket = await ticketsService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  return <PageHeader icon={LifeBuoyIcon} title={ticket.subject} />;
}

async function DetailsData({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let ticket;
  try {
    ticket = await ticketsService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const staff = await db
    .select({ publicId: users.publicId, name: users.name })
    .from(users)
    .where(inArray(users.role, ["admin", "member"]));

  const [currentOwner] = ticket.currentOwner
    ? await db
        .select({ publicId: users.publicId, name: users.name })
        .from(users)
        .where(inArray(users.id, [ticket.currentOwner]))
    : [];

  const staffOptions = staff.map((s) => ({ id: s.publicId, name: s.name ?? "Staff" }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <TicketStatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        <Badge variant="secondary" className="capitalize">
          {CATEGORY_LABEL[ticket.category] ?? ticket.category}
        </Badge>
      </div>
      <TicketControls
        ticketId={ticket.publicId}
        status={ticket.status as TicketStatus}
        priority={ticket.priority as TicketPriority}
        ownerId={currentOwner?.publicId ?? null}
        staff={staffOptions}
      />
    </div>
  );
}

async function ConversationData({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const ticketP = ticketsService.read(id);
  const messagesP = ticketsService.listMessages(id);
  let ticket;
  try {
    ticket = await ticketP;
  } catch (e) {
    void messagesP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const messages = await messagesP;

  return (
    <div className="space-y-4">
      <ReplyBox ticketId={ticket.publicId} />
      <div className="space-y-2">
        {messages.map((m) => (
          <div
            key={m.publicId}
            className={cn(
              "rounded-lg border p-3",
              m.authorType === "system" && "bg-muted/40 text-muted-foreground text-sm",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold">{AUTHOR_LABEL[m.authorType] ?? m.authorType}</span>
              <span className="text-muted-foreground nums text-xs">
                {formatEpoch(m.createdAt, { mode: "datetime" })}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailsFallback() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <TicketControls.Skeleton />
    </div>
  );
}

function ConversationFallback() {
  return (
    <div className="space-y-4">
      <ReplyBox.Skeleton />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-28" />
            </div>
            <Skeleton className="mt-1 h-4 w-full max-w-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
