"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireStaff } from "@/lib/auth/guards";
import { setSupportHours } from "@/lib/services/app-settings.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import {
  ticketsService,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/services/tickets.service";
import { uploadAttachments } from "@/lib/services/ticket-attachments";
import type { TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

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

export async function setCategory(
  ticketId: string,
  category: TicketCategoryValue,
  subcategory: string,
) {
  await requireStaff();
  await ticketsService.setCategory(ticketId, category, subcategory);
  revalidatePath("/dashboard/tickets");
  revalidatePath(`/dashboard/tickets/${ticketId}`);
  // Complaints analytics group by these columns; refresh so corrected buckets show up.
  revalidatePath("/dashboard/analytics/complaints");
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

/** Support days, hours and usual reply time, shown to customers in Support. */
export async function saveSupportHours(input: unknown): Promise<ActionResult> {
  // Returned, not thrown: production replaces a thrown action error with React #441.
  return runAction(async () => {
    await requireAdmin();
    await setSupportHours(input);
    revalidatePath("/dashboard/tickets");
    revalidatePath("/me/support", "layout");
  });
}
