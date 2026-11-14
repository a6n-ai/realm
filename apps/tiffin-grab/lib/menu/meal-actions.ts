"use server";

import { revalidateOrder } from "@/lib/revalidate";
import { NotFoundError } from "@foundry/commons";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders } from "@/db/schema";
import { requireCustomerId } from "@/lib/account/customer";
import { assertCanManageOrder, assertOrderUnlocked } from "@/lib/deliveries/customer-deliveries.service";
import { selectionsService } from "@/lib/menu/selections.service";
import { runAction, type ActionResult } from "@/lib/actions/action-result";

const me = () => requireCustomerId(new NotFoundError("Not signed in"));

export type PickItem = {
  menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string;
  personIndex: number;
  pickIndex?: number;
  dishId: string;
};

export async function saveMyMealSelections(input: {
  orderId: string;
  picks: PickItem[];
}): Promise<ActionResult<{ saved: number }>> {
  return runAction(async () => {
    if (!input.picks || input.picks.length === 0) {
      return { saved: 0 };
    }
    const actorId = await me();
    await assertCanManageOrder(input.orderId); // owner OR staff
    await assertOrderUnlocked(input.orderId);
    const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
    if (!order) throw new NotFoundError("Subscription not found");

    const weekPublicIds = [...new Set(input.picks.map((p) => p.menuWeekId))];
    const weeks = await db.select().from(menuWeeks).where(inArray(menuWeeks.publicId, weekPublicIds));
    const weeksByPublicId = new Map(weeks.map((w) => [w.publicId, w]));

    for (const pick of input.picks) {
      const week = weeksByPublicId.get(pick.menuWeekId);
      if (!week) throw new NotFoundError("Menu week not found");
      await selectionsService.setSelection({
        order,
        menuWeek: week,
        dayOfWeek: pick.dayOfWeek,
        slot: pick.slot,
        personIndex: pick.personIndex,
        pickIndex: pick.pickIndex ?? 1,
        dishPublicId: pick.dishId,
        actorId,
      });
    }

    revalidateOrder(input.orderId, { customerApp: true });
    return { saved: input.picks.length };
  });
}

