"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { sendRenewalReminderNow } from "@/lib/notifications/renewal-reminder";
import { assertOrderVisible } from "@/lib/services/orders.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { addTrackNote, logTrackActivity, setTrackStatus } from "@/lib/services/renewal-tracking.service";
import type { LostReason } from "@/lib/services/inquiries.service";
import type { TrackStatus } from "@/lib/renewals/status";
import { runAction, type ActionResult } from "@/lib/actions/action-result";

async function guardOrder(orderPublicId: string) {
  await requirePermission({ order: ["write"] });
  await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
}

function revalidateRenewals(customerPublicId: string | null) {
  revalidatePath("/dashboard/renewals");
  if (!customerPublicId) return;
  revalidatePath(`/dashboard/renewals/customers/${customerPublicId}`);
  revalidatePath(`/dashboard/customers/${customerPublicId}/renewals`);
}

/** Send the renewal reminder email now for one of this customer's running plans. */
export async function sendRenewalReminderAction(orderPublicId: string, customerPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await guardOrder(orderPublicId);
    if ((await sendRenewalReminderNow(orderPublicId)) !== "sent") return "Already sent today";
    await logTrackActivity(orderPublicId, { type: "reminder_sent" });
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
    await setTrackStatus(orderPublicId, input);
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
    await addTrackNote(orderPublicId, note, nextFollowUpAt);
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
    await logTrackActivity(orderPublicId, input);
  });
  revalidateRenewals(customerPublicId);
  return res;
}
