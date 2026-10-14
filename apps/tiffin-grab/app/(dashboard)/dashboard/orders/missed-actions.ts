"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { assertDeliveryVisible, resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { currentUserId } from "@/lib/services/session-service";
import { moveMissedDelivery, reconcileMissedDeliveries } from "@/lib/services/missed-deliveries.service";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";

export async function reconcileMissedAction(): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    const visible = await resolveSessionVisibleOrgIds(await getSession());
    const r = await reconcileMissedDeliveries(visible, await currentUserId());
    if (r.days === 0) return "Nothing to reconcile";
    return `Checked ${r.days} day${r.days === 1 ? "" : "s"} with OptimoRoute: ${r.delivered} confirmed delivered, ${r.notDelivered} not delivered (on hold), ${r.stillMissed} still missed`;
  });
  if ("ok" in res) {
    revalidatePath("/dashboard/orders");
    revalidatePath("/dashboard/dispatch");
    revalidatePath("/me", "layout");
  }
  return res;
}

/** Did not go out: hold the day and move its tiffin to `date` (the order page's Move, same rules). */
export async function moveMissedAction(deliveryPublicId: string, date: string): Promise<ActionResult> {
  const res = await runAction(async () => {
    await requireStaff();
    await assertDeliveryVisible(deliveryPublicId, await resolveSessionVisibleOrgIds(await getSession()));
    const { carriedOn } = await moveMissedDelivery(deliveryPublicId, date, await currentUserId());
    return `Moved to ${carriedOn}`;
  });
  if ("ok" in res) {
    revalidatePath("/dashboard/orders", "layout");
    revalidatePath("/me", "layout");
  }
  return res;
}
