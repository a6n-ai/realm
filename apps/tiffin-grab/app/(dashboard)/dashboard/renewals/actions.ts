"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { sendRenewalReminderNow } from "@/lib/notifications/renewal-reminder";
import { assertOrderVisible } from "@/lib/services/orders.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { addTrackNote, logTrackActivity, setTrackStatus } from "@/lib/services/renewal-tracking.service";
import type { LostReason } from "@/lib/services/inquiries.service";
import { TRACK_STATUSES, type TrackStatus } from "@/lib/renewals/status";
import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { createLogger } from "@foundry/commons/logger";

const logger = createLogger("renewals:actions");

const MAX_NOTE = 2000;
const LOST_REASONS = ["price", "out_of_zone", "no_response", "chose_competitor", "not_ready", "other", "asked_to_stop"] as const;

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

function parseInput<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ValidationError("Invalid input");
  return parsed.data;
}

async function guardOrder(orderPublicId: string) {
  await requirePermission({ order: ["write"] });
  await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
}

function revalidateRenewals(customerPublicId: unknown) {
  revalidatePath("/dashboard/renewals");
  const customer = z.string().min(1).safeParse(customerPublicId);
  if (!customer.success) return;
  revalidatePath(`/dashboard/renewals/customers/${customer.data}`);
  revalidatePath(`/dashboard/customers/${customer.data}/renewals`);
}

/** Send the renewal reminder email now for one of this customer's running plans. */
export async function sendRenewalReminderAction(orderPublicId: string, customerPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await guardOrder(orderPublicId);
    const id = parseInput(orderIdSchema, orderPublicId);
    if ((await sendRenewalReminderNow(id)) !== "sent") return "Already sent today";
    try {
      await logTrackActivity(id, { type: "reminder_sent" });
    } catch (err) {
      logger.warn({ err, orderPublicId: id }, "reminder sent but activity log failed");
    }
    return "Reminder sent";
  });
  revalidateRenewals(customerPublicId);
  return res;
}

export async function setTrackStatusAction(
  orderPublicId: string,
  customerPublicId: string | null,
  input: { status: TrackStatus | null; lostReason?: LostReason; note?: string; nextFollowUpAt?: number | null },
): Promise<ActionResult> {
  const res = await runAction(async () => {
    await guardOrder(orderPublicId);
    await setTrackStatus(parseInput(orderIdSchema, orderPublicId), parseInput(trackStatusInputSchema, input));
  });
  revalidateRenewals(customerPublicId);
  return res;
}

export async function addTrackNoteAction(
  orderPublicId: string,
  customerPublicId: string | null,
  note: string,
  nextFollowUpAt?: number,
): Promise<ActionResult> {
  const res = await runAction(async () => {
    await guardOrder(orderPublicId);
    await addTrackNote(
      parseInput(orderIdSchema, orderPublicId),
      parseInput(noteSchema, note),
      parseInput(followUpSchema.optional(), nextFollowUpAt),
    );
  });
  revalidateRenewals(customerPublicId);
  return res;
}

export async function logTrackActivityAction(
  orderPublicId: string,
  customerPublicId: string | null,
  input: { type: "call" | "whatsapp" | "email" | "callback"; note?: string; nextFollowUpAt?: number },
): Promise<ActionResult> {
  const res = await runAction(async () => {
    await guardOrder(orderPublicId);
    await logTrackActivity(parseInput(orderIdSchema, orderPublicId), parseInput(logActivityInputSchema, input));
  });
  revalidateRenewals(customerPublicId);
  return res;
}
