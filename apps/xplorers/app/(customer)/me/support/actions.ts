"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { bookings } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { ticketsService, type TicketCategory } from "@/lib/services/tickets.service";
import { uploadAttachments } from "@/lib/services/ticket-attachments";
import { isTicketCategory, isValidPair } from "@/lib/support/ticket-taxonomy";

export async function createTicket(form: FormData): Promise<void> {
  const subject = String(form.get("subject") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const categoryRaw = String(form.get("category") ?? "").trim();
  const subcategoryRaw = String(form.get("subcategory") ?? "").trim();
  const bookingPublicId = String(form.get("bookingPublicId") ?? "").trim() || undefined;

  if (!isTicketCategory(categoryRaw)) {
    throw new ValidationError("Invalid category");
  }
  if (!isValidPair(categoryRaw, subcategoryRaw)) {
    throw new ValidationError("Invalid sub-category for the chosen category");
  }
  const category = categoryRaw as TicketCategory;
  const subcategory = subcategoryRaw;

  let bookingId: bigint | undefined;
  if (bookingPublicId) {
    const userId = await currentUserId();
    if (userId != null) {
      const [row] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.publicId, bookingPublicId), eq(bookings.userId, userId)))
        .limit(1);
      bookingId = row?.id;
    }
  }

  const ticket = await ticketsService.create({
    subject,
    category,
    subcategory,
    body,
    ...(bookingId != null ? { bookingId } : {}),
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
