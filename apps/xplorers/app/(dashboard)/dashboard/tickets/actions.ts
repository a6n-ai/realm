"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { ticketsService, type TicketStatus } from "@/lib/services/tickets.service";
import { uploadAttachments } from "@/lib/services/ticket-attachments";

export async function setStatus(
  ticketId: string,
  toStatus: TicketStatus,
): Promise<{ previous: TicketStatus }> {
  await requireStaff();
  const { previous } = await ticketsService.changeStatus(ticketId, toStatus);
  revalidatePath("/dashboard/tickets");
  revalidatePath(`/dashboard/tickets/${ticketId}`);
  return { previous: previous as TicketStatus };
}

export async function replyTicket(ticketId: string, form: FormData): Promise<void> {
  await requireStaff();
  const body = String(form.get("body") ?? "");
  const attachments = await uploadAttachments(
    ticketId,
    form.getAll("attachment"),
    form.getAll("attachment_thumb"),
  );
  await ticketsService.reply(ticketId, body, attachments);
  revalidatePath(`/dashboard/tickets/${ticketId}`);
  revalidatePath("/dashboard/tickets");
}
