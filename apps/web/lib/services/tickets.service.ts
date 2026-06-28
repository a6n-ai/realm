import { BaseRepository, UpdatableRepository } from "@tiffin/commons-drizzle";
import { AuthError, ForbiddenError, Role, ValidationError, type RoleValue } from "@tiffin/commons";
import { asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { ticketMessages, tickets, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import type { SortState } from "@/lib/list/sort";

export type TicketStatus = (typeof tickets.status.enumValues)[number];
export type TicketCategory = (typeof tickets.category.enumValues)[number];
export type TicketPriority = (typeof tickets.priority.enumValues)[number];
export type TicketMessageAuthor = (typeof ticketMessages.authorType.enumValues)[number];

export type QueueSortColumn =
  | "subject"
  | "customer"
  | "category"
  | "status"
  | "owner"
  | "priority"
  | "lastMessage"
  | "created";

export type CreateTicketInput = {
  subject: string;
  category: TicketCategory;
  body: string;
  orderId?: bigint;
};

// A ticket waiting on staff (open / in_progress) whose last activity is older
// than this is "overdue" — surfaced in the queue so staff notice stale work.
// waiting_on_customer is waiting on the customer, so it never counts.
const OVERDUE_MS = 24 * 60 * 60 * 1000;

export function computeOverdue(status: string, lastMessageAt: number | null, now: number): boolean {
  if (status !== "open" && status !== "in_progress") return false;
  if (lastMessageAt == null) return false;
  return lastMessageAt < now - OVERDUE_MS;
}

type Actor = { id: bigint; role: RoleValue; isStaff: boolean };

class TicketsService extends SessionUpdatableService<typeof tickets> {
  // Resolve the acting user (internal id + role). Throws when unauthenticated —
  // every entry point needs a known actor (customer or staff).
  private async actor(): Promise<Actor> {
    const session = await getSession();
    const id = await this.currentUserId();
    if (!session || id == null) throw new AuthError();
    const role = session.user.role as RoleValue;
    const isStaff = role === Role.ADMIN || role === Role.MEMBER;
    return { id, role, isStaff };
  }

  // Trust boundary: a customer may only touch their own tickets; staff bypass via
  // role. Every customer-facing read/reply routes through this.
  private async assertAccess(ticket: typeof tickets.$inferSelect): Promise<Actor> {
    const actor = await this.actor();
    if (!actor.isStaff && ticket.raisedBy !== actor.id) throw new ForbiddenError();
    return actor;
  }

  private async assertStaff(): Promise<Actor> {
    const actor = await this.actor();
    if (!actor.isStaff) throw new ForbiddenError();
    return actor;
  }

  private message(ticketId: bigint, authorId: bigint, authorType: TicketMessageAuthor, body: string) {
    return ticketMessagesService.create({ ticketId, authorId, authorType, body });
  }

  async create(input: CreateTicketInput): Promise<typeof tickets.$inferSelect> {
    const actor = await this.actor();
    const subject = (input.subject ?? "").trim();
    const body = (input.body ?? "").trim();
    if (!subject) throw new ValidationError("Subject is required");
    if (!body) throw new ValidationError("Message is required");

    const ticket = await super.create({
      raisedBy: actor.id,
      subject,
      category: input.category,
      ...(input.orderId != null ? { orderId: input.orderId } : {}),
    });
    await this.message(ticket.id, actor.id, "customer", body);
    return ticket;
  }

  async reply(publicId: string, body: string): Promise<void> {
    const trimmed = (body ?? "").trim();
    if (!trimmed) throw new ValidationError("Message is required");
    const ticket = await this.read(publicId);
    const actor = await this.assertAccess(ticket);
    const authorType: TicketMessageAuthor = actor.isStaff ? "staff" : "customer";
    await this.message(ticket.id, actor.id, authorType, trimmed);

    // A customer reply on a resolved ticket reopens it (the issue is not done);
    // a staff reply on an in-progress ticket hands the ball back to the customer.
    if (!actor.isStaff && ticket.status === "resolved") {
      await this.update(publicId, { status: "open", closedAt: null });
    } else if (actor.isStaff && ticket.status === "in_progress") {
      await this.update(publicId, { status: "waiting_on_customer" });
    }
  }

  async changeStatus(publicId: string, toStatus: TicketStatus): Promise<{ previous: TicketStatus }> {
    const actor = await this.assertStaff();
    const ticket = await this.read(publicId);
    const previous = ticket.status as TicketStatus;
    if (previous === toStatus) return { previous };
    const closing = toStatus === "resolved" || toStatus === "closed";
    await this.update(publicId, { status: toStatus, closedAt: closing ? Date.now() : null });
    await this.message(ticket.id, actor.id, "system", `Status: ${previous} → ${toStatus}`);
    return { previous };
  }

  async assign(publicId: string, ownerId: string): Promise<void> {
    const actor = await this.assertStaff();
    const ticket = await this.read(publicId);
    const [owner] = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(eq(users.publicId, ownerId))
      .limit(1);
    if (!owner) throw new ValidationError("Unknown owner");
    await this.update(publicId, { currentOwner: owner.id });
    await this.message(ticket.id, actor.id, "system", `Assigned to ${owner.name ?? "staff"}`);
  }

  async setPriority(publicId: string, priority: TicketPriority): Promise<void> {
    const actor = await this.assertStaff();
    const ticket = await this.read(publicId);
    const previous = ticket.priority as TicketPriority;
    if (previous === priority) return;
    await this.update(publicId, { priority });
    await this.message(ticket.id, actor.id, "system", `Priority: ${previous} → ${priority}`);
  }

  async listForCustomer(userId: bigint) {
    return db
      .select()
      .from(tickets)
      .where(eq(tickets.raisedBy, userId))
      .orderBy(desc(tickets.createdAt));
  }

  async listMessages(publicId: string) {
    const ticket = await this.read(publicId);
    await this.assertAccess(ticket);
    return db
      .select()
      .from(ticketMessages)
      .where(eq(ticketMessages.ticketId, ticket.id))
      .orderBy(asc(ticketMessages.createdAt));
  }

  async listForQueue(sort: SortState<QueueSortColumn> = { column: "lastMessage", dir: "desc" }) {
    const customer = alias(users, "customer");
    const owner = alias(users, "owner");

    const agg = db
      .select({
        ticketId: ticketMessages.ticketId,
        lastMessageAt: sql<number>`max(${ticketMessages.createdAt})`.as("last_message_at"),
      })
      .from(ticketMessages)
      .groupBy(ticketMessages.ticketId)
      .as("agg");

    const SORT_COL = {
      subject: tickets.subject,
      customer: customer.name,
      category: tickets.category,
      status: tickets.status,
      owner: owner.name,
      priority: tickets.priority,
      lastMessage: agg.lastMessageAt,
      created: tickets.createdAt,
    } as const;
    const col = SORT_COL[sort.column] ?? agg.lastMessageAt;

    const rows = await db
      .select({
        publicId: tickets.publicId,
        subject: tickets.subject,
        customerName: customer.name,
        category: tickets.category,
        status: tickets.status,
        ownerName: owner.name,
        priority: tickets.priority,
        createdAt: tickets.createdAt,
        lastMessageAt: agg.lastMessageAt,
      })
      .from(tickets)
      .innerJoin(customer, eq(tickets.raisedBy, customer.id))
      .leftJoin(owner, eq(tickets.currentOwner, owner.id))
      .leftJoin(agg, eq(agg.ticketId, tickets.id))
      .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
      .limit(500);

    const now = Date.now();
    return rows.map((r) => ({ ...r, overdue: computeOverdue(r.status, r.lastMessageAt, now) }));
  }
}

const repo = new UpdatableRepository(db, tickets, tickets.publicId, tickets.id);
export const ticketsService = new TicketsService(repo);

const ticketMessagesService = new SessionBaseService(
  new BaseRepository(db, ticketMessages, ticketMessages.publicId, ticketMessages.id),
);

export type QueueRow = Awaited<ReturnType<TicketsService["listForQueue"]>>[number];
export type CustomerTicketRow = Awaited<ReturnType<TicketsService["listForCustomer"]>>[number];
export type TicketRecord = typeof tickets.$inferSelect;
export type TicketMessageRecord = typeof ticketMessages.$inferSelect;
