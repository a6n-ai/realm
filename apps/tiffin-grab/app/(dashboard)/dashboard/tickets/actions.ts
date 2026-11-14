"use server";

import { setSupportHours } from "@/lib/support/support-hours-settings";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import {
  ticketsService,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support/tickets.service";
import { uploadAttachments } from "@/lib/support/ticket-attachments";
import type { TicketCategoryValue } from "@/lib/support/ticket-taxonomy";

const ticketOpts = (ticketId: string, extra: readonly string[] = []) =>
  ({ guard: "staff", revalidate: ["/dashboard/tickets", `/dashboard/tickets/${ticketId}`, ...extra] }) as const;

export async function setStatus(
  ticketId: string,
  toStatus: TicketStatus,
): Promise<ActionResult<{ previous: TicketStatus }>> {
  return staffAction(ticketOpts(ticketId), async () => {
    const { previous } = await ticketsService.changeStatus(ticketId, toStatus);
    return { previous: previous as TicketStatus };
  });
}

export async function assignOwner(ticketId: string, ownerId: string): Promise<ActionResult> {
  return staffAction(ticketOpts(ticketId), async () => {
    await ticketsService.assign(ticketId, ownerId);
  });
}

export async function setPriority(ticketId: string, priority: TicketPriority): Promise<ActionResult> {
  return staffAction(ticketOpts(ticketId), async () => {
    await ticketsService.setPriority(ticketId, priority);
  });
}

export async function setCategory(
  ticketId: string,
  category: TicketCategoryValue,
  subcategory: string,
): Promise<ActionResult> {
  // Complaints analytics group by these columns; refresh so corrected buckets show up.
  return staffAction(ticketOpts(ticketId, ["/dashboard/analytics/complaints"]), async () => {
    await ticketsService.setCategory(ticketId, category, subcategory);
  });
}

export async function replyTicket(ticketId: string, form: FormData): Promise<ActionResult> {
  return staffAction(ticketOpts(ticketId), async () => {
    // Refuse another franchise's ticket before writing files into its folder.
    await ticketsService.readForStaff(ticketId);
    const body = String(form.get("body") ?? "");
    const attachments = await uploadAttachments(
      ticketId,
      form.getAll("attachment"),
      form.getAll("attachment_thumb"),
    );
    await ticketsService.reply(ticketId, body, attachments);
  });
}

/** Support days, hours and usual reply time, shown to customers in Support. */
export async function saveSupportHours(input: unknown): Promise<ActionResult> {
  return staffAction(
    { guard: "admin", revalidate: ["/dashboard/tickets", ["/me/support", "layout"]] },
    async () => {
      await setSupportHours(input);
    },
  );
}
