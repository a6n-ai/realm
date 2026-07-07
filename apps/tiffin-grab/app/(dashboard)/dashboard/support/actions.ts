"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { ticketsService, type TicketCategory } from "@/lib/services/tickets.service";
import { uploadAttachments } from "@/lib/services/ticket-attachments";

// Resolve the signed-in customer's public_id → internal bigint. Used only to
// scope the linked order lookup to orders the customer actually owns.
async function currentUserId(): Promise<bigint | null> {
  const publicId = (await getSession())?.user?.id;
  if (!publicId) return null;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

export async function createTicket(input: {
  subject: string;
  category: TicketCategory;
  body: string;
  orderPublicId?: string;
}): Promise<void> {
  // Resolve the linked order scoped to the current customer so a ticket can
  // never be pinned to someone else's order. ticketsService.create itself sets
  // raisedBy to the acting user, so creation is already gated to the session.
  let orderId: bigint | undefined;
  if (input.orderPublicId) {
    const userId = await currentUserId();
    if (userId != null) {
      const [row] = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.publicId, input.orderPublicId), eq(orders.userId, userId)))
        .limit(1);
      orderId = row?.id;
    }
  }

  const ticket = await ticketsService.create({
    subject: input.subject,
    category: input.category,
    body: input.body,
    ...(orderId != null ? { orderId } : {}),
  });

  revalidatePath("/dashboard/support");
  redirect(`/dashboard/support/${ticket.publicId}`);
}

export async function replyTicket(ticketId: string, form: FormData): Promise<void> {
  const body = String(form.get("body") ?? "");
  const attachments = await uploadAttachments(
    ticketId,
    form.getAll("attachment"),
    form.getAll("attachment_thumb"),
  );
  await ticketsService.reply(ticketId, body, attachments);
  revalidatePath(`/dashboard/support/${ticketId}`);
  revalidatePath("/dashboard/support");
}
