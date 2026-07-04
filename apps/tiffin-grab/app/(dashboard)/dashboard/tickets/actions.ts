"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import {
  ticketsService,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/services/tickets.service";

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

export async function assignOwner(ticketId: string, ownerId: string) {
  await requireStaff();
  await ticketsService.assign(ticketId, ownerId);
  revalidatePath("/dashboard/tickets");
  revalidatePath(`/dashboard/tickets/${ticketId}`);
}

export async function setPriority(ticketId: string, priority: TicketPriority) {
  await requireStaff();
  await ticketsService.setPriority(ticketId, priority);
  revalidatePath("/dashboard/tickets");
  revalidatePath(`/dashboard/tickets/${ticketId}`);
}

export async function replyTicket(ticketId: string, body: string) {
  await requireStaff();
  await ticketsService.reply(ticketId, body);
  revalidatePath(`/dashboard/tickets/${ticketId}`);
  revalidatePath("/dashboard/tickets");
}
