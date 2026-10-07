import { BaseRepository, UpdatableRepository } from "@foundry/database";
import { AuthError, ForbiddenError, Role, ValidationError, type RoleValue } from "@foundry/commons";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { ticketMessages, tickets, type Attachment } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

export type TicketStatus = (typeof tickets.status.enumValues)[number];
export type TicketCategory = (typeof tickets.category.enumValues)[number];
export type TicketPriority = (typeof tickets.priority.enumValues)[number];
export type TicketMessageAuthor = (typeof ticketMessages.authorType.enumValues)[number];

export type CreateTicketInput = {
  subject: string;
  category: TicketCategory;
  subcategory: string;
  body: string;
  bookingId?: bigint;
  attachments?: Attachment[];
};

type Actor = { id: bigint; role: RoleValue; isStaff: boolean };

class TicketsService extends SessionUpdatableService<typeof tickets> {
  private async actor(): Promise<Actor> {
    const session = await getSession();
    const id = await this.currentUserId();
    if (!session || id == null) throw new AuthError();
    const role = session.user.role as RoleValue;
    const isStaff = role === Role.ADMIN || role === Role.MEMBER;
    return { id, role, isStaff };
  }

  private async assertAccess(ticket: typeof tickets.$inferSelect): Promise<Actor> {
    const actor = await this.actor();
    if (!actor.isStaff && ticket.raisedBy !== actor.id) throw new ForbiddenError();
    return actor;
  }

  private message(
    ticketId: bigint,
    authorId: bigint,
    authorType: TicketMessageAuthor,
    body: string,
    attachments?: Attachment[],
  ) {
    return ticketMessagesService.create({
      ticketId,
      authorId,
      authorType,
      body,
      ...(attachments && attachments.length ? { attachments } : {}),
    });
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
      subcategory: input.subcategory,
      ...(input.bookingId != null ? { bookingId: input.bookingId } : {}),
    });
    await this.message(ticket.id, actor.id, "customer", body, input.attachments);
    return ticket;
  }

  async reply(publicId: string, body: string, attachments: Attachment[] = []): Promise<void> {
    const ticket = await this.read(publicId);
    const actor = await this.assertAccess(ticket);

    if (ticket.status === "resolved" || ticket.status === "closed") {
      throw new ForbiddenError("This ticket is closed. Ask staff to reopen it to continue.");
    }

    const trimmed = (body ?? "").trim();
    if (!trimmed && attachments.length === 0) throw new ValidationError("Message is required");

    const authorType: TicketMessageAuthor = actor.isStaff ? "staff" : "customer";
    await this.message(ticket.id, actor.id, authorType, trimmed || "(attachment)", attachments);

    if (actor.isStaff && ticket.status === "in_progress") {
      await this.update(publicId, { status: "waiting_on_customer" });
    }
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

  /** Staff/customer gate used by the thread page after `read`. */
  async assertReadable(publicId: string): Promise<void> {
    const ticket = await this.read(publicId);
    await this.assertAccess(ticket);
  }

  async changeStatus(publicId: string, toStatus: TicketStatus): Promise<{ previous: TicketStatus }> {
    const actor = await this.actor();
    if (!actor.isStaff) throw new ForbiddenError();
    const ticket = await this.read(publicId);
    const previous = ticket.status as TicketStatus;
    if (previous === toStatus) return { previous };
    const closing = toStatus === "resolved" || toStatus === "closed";
    await this.update(publicId, { status: toStatus, closedAt: closing ? Date.now() : null });
    await this.message(ticket.id, actor.id, "system", `Status: ${previous} → ${toStatus}`);
    return { previous };
  }
}

const repo = new UpdatableRepository(db, tickets, tickets.publicId, tickets.id);
export const ticketsService = new TicketsService(repo);

const ticketMessagesService = new SessionBaseService(
  new BaseRepository(db, ticketMessages, ticketMessages.publicId, ticketMessages.id),
);

export type CustomerTicketRow = Awaited<ReturnType<TicketsService["listForCustomer"]>>[number];
export type TicketRecord = typeof tickets.$inferSelect;
export type TicketMessageRecord = typeof ticketMessages.$inferSelect;
