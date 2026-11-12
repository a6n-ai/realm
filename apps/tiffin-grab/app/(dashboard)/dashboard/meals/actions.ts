"use server";

import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { revalidateOrder } from "@/lib/revalidate";
import { isStaffRole } from "@/lib/auth/roles";
import { revalidatePath } from "next/cache";
import { AuthError, ValidationError } from "@foundry/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { currentUserId } from "@/lib/services/session-service";
import { selectionsService } from "@/lib/menu/selections.service";

export async function pickDish(input: {
  orderId: string;
  menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string;
  personIndex: number;
  pickIndex?: number;
  dishId: string;
}): Promise<ActionResult> {
  // Owner-or-staff, not a staffAction guard level: narrowing it to staff would lock out an order's own customer.
  const res = await runAction(() => pick(input));
  if ("ok" in res) {
    revalidatePath("/dashboard/meals");
    revalidateOrder(input.orderId);
  }
  return res;
}

async function pick(input: Parameters<typeof pickDish>[0]) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();

  // Order and menu-week lookups are independent — start both, then gate on order
  // for the auth check. Guard the early-started week query against the throw paths.
  const orderP = db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  const weekP = db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);

  const [order] = await orderP;
  if (!order) { void weekP.catch(() => {}); throw new ValidationError("Order not found"); }

  // Resolved for every actor, not just customers: staff picks are logged too, and an
  // unattributed meal_pick row is the exact thing this log exists to prevent.
  const actorId = await currentUserId();
  const isStaff = isStaffRole(session.user.role);
  if (!isStaff && (actorId == null || order.userId !== actorId)) {
    void weekP.catch(() => {});
    throw new AuthError();
  }

  const [week] = await weekP;
  if (!week) throw new ValidationError("Menu week not found");

  await selectionsService.setSelection({
    order,
    menuWeek: week,
    dayOfWeek: input.dayOfWeek,
    slot: input.slot,
    personIndex: input.personIndex,
    pickIndex: input.pickIndex ?? 1,
    dishPublicId: input.dishId,
    actorId,
  });
}
