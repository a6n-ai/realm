"use server";

import { z } from "zod";
import { sendRenewalReminderNow } from "@/lib/notifications/renewal-reminder";
import { addTrackNote, logTrackActivity, setTrackStatus } from "@/lib/renewals/renewal-tracking.service";
import { TRACK_STATUSES, type TrackStatus } from "@/lib/renewals/status";
import { LOST_REASON_OPTIONS, type LostReason } from "@/lib/inquiries/lost-reason";
import type { ActionResult } from "@/lib/actions/action-result";
import { parseInput, type Guard } from "@/lib/actions/staff-action";
import { createLogger } from "@foundry/commons/logger";
import { orderAction } from "@/lib/orders/order-action";

const logger = createLogger("renewals:actions");

const MAX_NOTE = 2000;
// z.enum needs a tuple type; the cast is the only thing it needs from the options list.
const LOST_REASONS = LOST_REASON_OPTIONS.map((o) => o.value) as [LostReason, ...LostReason[]];

const orderIdSchema = z.string().min(1);
const followUpSchema = z.number().finite();
const trackStatusInputSchema = z
  .object({
    status: z.enum(TRACK_STATUSES).nullable(),
    lostReason: z.enum(LOST_REASONS).optional(),
    note: z.string().max(MAX_NOTE).optional(),
    nextFollowUpAt: followUpSchema.nullable().optional(),
  })
  .strict();
const noteSchema = z.string().trim().min(1).max(MAX_NOTE);
const logActivityInputSchema = z
  .object({
    type: z.enum(["call", "whatsapp", "email", "callback"]),
    note: z.string().max(MAX_NOTE).optional(),
    nextFollowUpAt: followUpSchema.optional(),
  })
  .strict();

const ORDER_WRITE: Guard = { order: ["write"] };

function renewalPaths(customerPublicId: string | null) {
  return [
    "/dashboard/renewals",
    ...(customerPublicId
      ? [
          `/dashboard/renewals/customers/${customerPublicId}`,
          `/dashboard/inquiries/renewals/${customerPublicId}`,
          `/dashboard/customers/${customerPublicId}/renewals`,
        ]
      : []),
  ];
}

function renewalOpts(orderPublicId: string, customerPublicId: string | null) {
  return { guard: ORDER_WRITE, order: orderPublicId, revalidate: renewalPaths(customerPublicId) };
}

/** Send the renewal reminder email now for one of this customer's running plans. */
export async function sendRenewalReminderAction(orderPublicId: string, customerPublicId: string): Promise<ActionResult> {
  return orderAction(renewalOpts(orderPublicId, customerPublicId), async () => {
    const id = parseInput(orderIdSchema, orderPublicId);
    if ((await sendRenewalReminderNow(id)) !== "sent") return "Already sent today";
    try {
      await logTrackActivity(id, { type: "reminder_sent" });
    } catch (err) {
      logger.warn({ err, orderPublicId: id }, "reminder sent but activity log failed");
    }
    return "Reminder sent";
  });
}

export async function setTrackStatusAction(
  orderPublicId: string,
  customerPublicId: string | null,
  input: { status: TrackStatus | null; lostReason?: LostReason; note?: string; nextFollowUpAt?: number | null },
): Promise<ActionResult> {
  return orderAction(renewalOpts(orderPublicId, customerPublicId), async () => {
    await setTrackStatus(parseInput(orderIdSchema, orderPublicId), parseInput(trackStatusInputSchema, input));
  });
}

export async function addTrackNoteAction(
  orderPublicId: string,
  customerPublicId: string | null,
  note: string,
  nextFollowUpAt?: number,
): Promise<ActionResult> {
  return orderAction(renewalOpts(orderPublicId, customerPublicId), async () => {
    await addTrackNote(
      parseInput(orderIdSchema, orderPublicId),
      parseInput(noteSchema, note),
      parseInput(followUpSchema.optional(), nextFollowUpAt),
    );
  });
}

export async function logTrackActivityAction(
  orderPublicId: string,
  customerPublicId: string | null,
  input: { type: "call" | "whatsapp" | "email" | "callback"; note?: string; nextFollowUpAt?: number },
): Promise<ActionResult> {
  return orderAction(renewalOpts(orderPublicId, customerPublicId), async () => {
    await logTrackActivity(parseInput(orderIdSchema, orderPublicId), parseInput(logActivityInputSchema, input));
  });
}
