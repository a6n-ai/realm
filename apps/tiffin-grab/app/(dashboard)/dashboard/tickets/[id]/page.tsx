import { Suspense, cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LifeBuoyIcon } from "lucide-react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NotFoundError } from "@foundry/commons";
import { db } from "@/db/client";
import { mealSizes, orders, plans, tickets, users } from "@/db/schema";
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
import { OrderStatusBadge, PresenceDot } from "@/components/ds";
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

      {/* Inbox layout: who the customer is, the ticket's settings and their other chats on the
          left; the conversation (with its status pills, the one status control) on the right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:items-start">
        <div className="space-y-4">
          <SectionCard title="Customer">
            <Suspense fallback={<ChatListFallback />}>
              <CustomerData params={params} />
            </Suspense>
          </SectionCard>
          <SectionCard title="Ticket">
            <Suspense fallback={<DetailsFallback />}>
              <DetailsData params={params} />
            </Suspense>
          </SectionCard>
          <SectionCard title="Customer's chats">
            <Suspense fallback={<ChatListFallback />}>
              <CustomerChatsData params={params} />
            </Suspense>
          </SectionCard>
        </div>
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

/** Who raised the ticket, how to reach them, and the plan it's about (or their current one). */
async function CustomerData({ params }: { params: Promise<{ id: string }> }) {
  await ensureStaff();
  const { id } = await params;
  let ticket;
  try {
    ticket = await loadTicket(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [[customer], [order]] = await Promise.all([
    db
      .select({ publicId: users.publicId, name: users.name, email: users.email, phone: users.phone, addressLine: users.addressLine, city: users.city, postalCode: users.postalCode })
      .from(users)
      .where(eq(users.id, ticket.raisedBy))
      .limit(1),
    db
      .select({ publicId: orders.publicId, deploymentId: orders.deploymentId, status: orders.status, startDate: orders.startDate, mealSize: mealSizes.name, plan: plans.name })
      .from(orders)
      .innerJoin(mealSizes, eq(mealSizes.id, orders.mealSizeId))
      .innerJoin(plans, eq(plans.id, orders.planId))
      // The order the ticket was raised about; else the customer's latest live one.
      .where(ticket.orderId ? eq(orders.id, ticket.orderId) : and(eq(orders.userId, ticket.raisedBy), inArray(orders.status, ["active", "paused", "pending"])))
      .orderBy(desc(orders.createdAt))
      .limit(1),
  ]);
  if (!customer) return <p className="text-muted-foreground text-sm">Customer not found.</p>;
  const address = [customer.addressLine, customer.city, customer.postalCode].filter(Boolean).join(", ");
  return (
    <div className="space-y-3 text-sm">
      <div>
        <Link href={`/dashboard/customers/${customer.publicId}`} className="font-semibold hover:underline">
          {customer.name ?? customer.email ?? "Customer"}
        </Link>
        <dl className="text-muted-foreground mt-1 space-y-0.5">
          {customer.email ? <dd><a href={`mailto:${customer.email}`} className="hover:text-foreground hover:underline">{customer.email}</a></dd> : null}
          {customer.phone ? <dd><a href={`tel:${customer.phone}`} className="hover:text-foreground hover:underline nums">{customer.phone}</a></dd> : null}
          {address ? <dd>{address}</dd> : null}
        </dl>
      </div>
      {order ? (
        <Link href={`/dashboard/orders/${order.publicId}`} className="hover:bg-muted block rounded-md border p-2.5">
          <span className="text-muted-foreground block text-xs font-semibold tracking-wider uppercase">{ticket.orderId ? "Order on this ticket" : "Current plan"}</span>
          <span className="mt-1 flex items-center justify-between gap-2">
            <span className="truncate font-medium">{order.mealSize}</span>
            <OrderStatusBadge status={order.status} />
          </span>
          <span className="text-muted-foreground block text-xs">{[order.deploymentId, order.plan, order.startDate ? `from ${order.startDate}` : null].filter(Boolean).join(" · ")}</span>
        </Link>
      ) : (
        <p className="text-muted-foreground text-xs">No live plan.</p>
      )}
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
