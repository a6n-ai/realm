"use server";

import { getSession } from "@/lib/auth/session";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { currentUserId } from "@/lib/services/session-service";
import { moveMissedDelivery, reconcileMissedDeliveries } from "@/lib/deliveries/missed-deliveries.service";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { orderAction } from "@/lib/orders/order-action";

export async function reconcileMissedAction(): Promise<ActionResult> {
  return staffAction(
    { guard: "staff", revalidate: ["/dashboard/orders", "/dashboard/dispatch", ["/me", "layout"]] },
    async () => {
      const visible = await resolveSessionVisibleOrgIds(await getSession());
      const r = await reconcileMissedDeliveries(visible, await currentUserId());
      if (r.days === 0) return "Nothing to reconcile";
      return `Checked ${r.days} day${r.days === 1 ? "" : "s"} with OptimoRoute: ${r.delivered} confirmed delivered, ${r.notDelivered} not delivered (on hold), ${r.stillMissed} still missed`;
    },
  );
}

/** Did not go out: hold the day and move its tiffin to `date` (the order page's Move, same rules). */
export async function moveMissedAction(deliveryPublicId: string, date: string): Promise<ActionResult> {
  return orderAction({ delivery: deliveryPublicId, revalidate: [["/dashboard/orders", "layout"], ["/me", "layout"]] }, async () => {
    const { carriedOn } = await moveMissedDelivery(deliveryPublicId, date, await currentUserId());
    return `Moved to ${carriedOn}`;
  });
}
