"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { ValidationError } from "@realm/commons";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { ticketsService, type TicketCategory } from "@/lib/services/tickets.service";
import { uploadAttachments } from "@/lib/services/ticket-attachments";

const CATEGORIES = new Set<TicketCategory>(["order", "billing", "catering", "general"]);

export async function createTicket(form: FormData): Promise<void> {
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const categoryRaw = String(form.get("category") ?? "general");
  const orderPublicId = String(form.get("orderPublicId") ?? "").trim() || undefined;

  if (!CATEGORIES.has(categoryRaw as TicketCategory)) {
    throw new ValidationError("Invalid category");
  }
  const category = categoryRaw as TicketCategory;

  // Resolve the linked order scoped to the current customer so a ticket can
  // never be pinned to someone else's order. ticketsService.create itself sets
  // raisedBy to the acting user, so creation is already gated to the session.
  let orderId: bigint | undefined;
  if (orderPublicId) {
    const userId = await currentUserId();
    if (userId != null) {
      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.publicId, orderPublicId), eq(orders.userId, userId)))
        .limit(1);
      orderId = row?.id;
    }
  }

  // Create first so upload paths can use the ticket public id, then attach images
  // to the opening customer message (same storage as reply attachments).
  const ticket = await ticketsService.create({
    subject,
    category,
    body,
    ...(orderId != null ? { orderId } : {}),
  });

  const attachments = await uploadAttachments(
    ticket.publicId,
    form.getAll("attachment"),
    form.getAll("attachment_thumb"),
  );
  if (attachments.length > 0) {
    await ticketsService.setOpeningAttachments(ticket.publicId, attachments);
  }

  revalidatePath("/me/support");
  redirect(`/me/support/${ticket.publicId}`);
}

export async function replyTicket(ticketId: string, form: FormData): Promise<void> {
  const body = String(form.get("body") ?? "");
  const attachments = await uploadAttachments(
    ticketId,
    form.getAll("attachment"),
    form.getAll("attachment_thumb"),
  );
  await ticketsService.reply(ticketId, body, attachments);
  revalidatePath(`/me/support/${ticketId}`);
  revalidatePath("/me/support");
}
