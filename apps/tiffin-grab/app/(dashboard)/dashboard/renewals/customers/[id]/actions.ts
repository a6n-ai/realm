"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { sendRenewalReminderNow } from "@/lib/notifications/renewal-reminder";
import { assertOrderVisible, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

/** Send the renewal reminder email now for one of this customer's running plans. */
export async function sendRenewalReminderAction(orderPublicId: string, customerPublicId: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requirePermission({ order: ["write"] });
    await assertOrderVisible(orderPublicId, await resolveSessionVisibleOrgIds(await getSession()));
    return (await sendRenewalReminderNow(orderPublicId)) === "sent" ? "Reminder sent" : "Already sent today";
  });
  revalidatePath(`/dashboard/renewals/customers/${customerPublicId}`);
  return res;
}
