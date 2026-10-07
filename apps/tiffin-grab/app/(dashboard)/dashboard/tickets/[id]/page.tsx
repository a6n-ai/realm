import { Suspense, cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { desc, eq, inArray } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { db } from "@/db/client";
import { tickets, users } from "@/db/schema";
import { formatEpoch } from "@/lib/format/datetime";
import { requireStaff } from "@/lib/auth/guards";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  ticketsService,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/services/tickets.service";
import { attachmentHref } from "@/lib/services/ticket-attachments";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { TicketStatusBadge, PriorityBadge, categoryLabel } from "../ticket-badges";
import { subcategoryLabel } from "@/lib/support/ticket-taxonomy";
import { TicketControls, ReplyBox, ReplyBoxSkeleton, StatusPills, TicketControlsSkeleton } from "./ticket-controls";
import { PresenceDot } from "@/components/ds";
import { cn } from "@foundry/ui/cn";
import { ChatMessageListSkeleton } from "@foundry/design-system";
import { ChatPane } from "./chat-pane";

const AUTHOR_LABEL: Record<string, string> = {
  customer: "Customer",
  staff: "Staff",
  system: "System",
};

// The three Suspense blocks below each need the same auth + ticket. cache()
// dedupes them per request so one row-click does one requireStaff + one read
// instead of three of each (the fan-out that intermittently saturated the pool).
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

      {/* Inbox layout: this customer's chats on the left, the open conversation on the right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:items-start">
        <SectionCard title="Customer's chats">
          <Suspense fallback={<ChatListFallback />}>
            <CustomerChatsData params={params} />
          </Suspense>
        </SectionCard>
        <SectionCard title="Conversation">
          <Suspense fallback={<ConversationFallback />}>
            <ConversationData params={params} />
          </Suspense>
        </SectionCard>
      </div>
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
          {categoryLabel(ticket.category)}
        </Badge>
        {subcategoryLabel(ticket.category, ticket.subcategory) ? (
          <Badge variant="outline">{subcategoryLabel(ticket.category, ticket.subcategory)}</Badge>
        ) : null}
      </div>
      {ticket.rating != null ? (
        <p className="text-sm">
          <span className="text-muted-foreground">Customer rating: </span>
          <span className="font-medium text-amber-500" aria-label={`${ticket.rating} out of 5 stars`}>{"★".repeat(ticket.rating)}{"☆".repeat(5 - ticket.rating)}</span>
          {ticket.ratingNote ? <span className="text-muted-foreground"> · “{ticket.ratingNote}”</span> : null}
        </p>
      ) : null}
      <TicketControls
        // Keyed by status: its selects read their initial value only, and the chat's
        // status pills can change it underneath them.
        key={`${ticket.status}:${ticket.priority}:${ticket.currentOwner ?? ""}`}
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
  await ensureStaff();
  const { id } = await params;

  const ticketP = loadTicket(id);
  const messagesP = ticketsService.listMessages(id);
  const settingsP = getAppSettings();
  let ticket;
  try {
    ticket = await ticketP;
  } catch (e) {
    void messagesP.catch(() => {});
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [messages, { timezone }] = await Promise.all([messagesP, settingsP]);
  const closed = ticket.status === "resolved" || ticket.status === "closed";
  const channel = `ticket:${ticket.publicId}`;

  // Mint a token-gated href per attachment at render time (staff already passed requireStaff above).
  const withHref = await Promise.all(
    messages.map(async (m) => ({
      ...m,
      attachments: m.attachments
        ? await Promise.all(
            m.attachments.map(async (a) => ({ thumbUrl: a.thumbUrl, name: a.name, href: await attachmentHref(a) })),
          )
        : null,
    })),
  );
  const authorIds = [...new Set(messages.map((m) => m.authorId))];
  const names = new Map(
    (authorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)) : [])
      .map((u) => [u.id, u.name]),
  );

  // Staff read it like a chat: their side on the right, the customer on the left, oldest first.
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPills ticketId={ticket.publicId} status={ticket.status as TicketStatus} />
        <PresenceDot channel={channel} peerRole="customer" label="Customer" />
      </div>
      <ChatPane
        timezone={timezone}
        messages={withHref.map((m) => ({
          publicId: m.publicId,
          authorType: m.authorType,
          staffName: m.authorType === "staff" ? names.get(m.authorId) ?? AUTHOR_LABEL.staff : null,
          body: m.body,
          createdAt: m.createdAt,
          attachments: m.attachments,
        }))}
      />
      <ReplyBox ticketId={ticket.publicId} closed={closed} channel={channel} peerRole="customer" />
    </div>
  );
}

const DONE = new Set(["resolved", "closed"]);

async function CustomerChatsData({ params }: { params: Promise<{ id: string }> }) {
  await ensureStaff();
  const { id } = await params;
  let ticket;
  try {
    ticket = await loadTicket(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [rows, { timezone }] = await Promise.all([
    db
      .select({ publicId: tickets.publicId, subject: tickets.subject, status: tickets.status, updatedAt: tickets.updatedAt })
      .from(tickets)
      .where(eq(tickets.raisedBy, ticket.raisedBy))
      .orderBy(desc(tickets.updatedAt))
      .limit(30),
    getAppSettings(),
  ]);
  const open = rows.filter((r) => !DONE.has(r.status));
  const past = rows.filter((r) => DONE.has(r.status));
  const item = (r: (typeof rows)[number]) => {
    const current = r.publicId === ticket.publicId;
    return (
      <li key={r.publicId}>
        <Link
          href={`/dashboard/tickets/${r.publicId}`}
          aria-current={current ? "page" : undefined}
          className={cn("block rounded-md px-3 py-2 text-sm", current ? "bg-primary/10 ring-primary/40 ring-1" : "hover:bg-muted")}
        >
          <span className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{r.subject}</span>
            <TicketStatusBadge status={r.status} />
          </span>
          <span className="text-muted-foreground nums block text-xs">{formatEpoch(Number(r.updatedAt), { mode: "datetime", timeZone: timezone })}</span>
        </Link>
      </li>
    );
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-muted-foreground px-1 text-xs font-semibold tracking-wider uppercase">Open · {open.length}</p>
        {open.length ? <ul className="space-y-1">{open.map(item)}</ul> : <p className="text-muted-foreground px-1 text-sm">No open chats.</p>}
      </div>
      {past.length > 0 && (
        <div className="space-y-1">
          <p className="text-muted-foreground px-1 text-xs font-semibold tracking-wider uppercase">Past · {past.length}</p>
          <ul className="space-y-1">{past.map(item)}</ul>
        </div>
      )}
    </div>
  );
}

function ChatListFallback() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
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
      <TicketControlsSkeleton />
    </div>
  );
}

function ConversationFallback() {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Skeleton className="h-4 w-24" />
      </div>
      <ChatMessageListSkeleton />
      <ReplyBoxSkeleton />
    </div>
  );
}
