"use server";

import { revalidatePath } from "next/cache";
import { AppError, NotFoundError } from "@foundry/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { assertCanManageOrder } from "@/lib/services/customer-deliveries.service";
import { selectionsService } from "@/lib/menu/selections.service";
import { runAction, type ActionResult } from "../action-result";

async function me(): Promise<bigint> {
  const id = await currentUserId();
  if (id == null) throw new NotFoundError("Not signed in");
  return id;
}

export async function pickMyDish(input: {
  orderId: string; menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string; personIndex: number; pickIndex?: number; dishId: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const actorId = await me();
    await assertCanManageOrder(input.orderId); // owner OR staff
    const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
    if (!order) throw new NotFoundError("Subscription not found");
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new NotFoundError("Menu week not found");
    await selectionsService.setSelection({
      order, menuWeek: week, dayOfWeek: input.dayOfWeek, slot: input.slot,
      personIndex: input.personIndex, pickIndex: input.pickIndex ?? 1, dishPublicId: input.dishId,
      actorId,
    });
    revalidatePath("/me");
    revalidatePath(`/dashboard/orders/${input.orderId}`);
  });
}

export async function applyMyDishToWeek(input: {
  orderId: string; menuWeekId: string; slot: string; personIndex: number; pickIndex?: number; dishId: string;
}): Promise<{ applied: number; skipped: { dateIso: string; reason: string }[] } | { error: string }> {
  try {
    const actorId = await me();
    await assertCanManageOrder(input.orderId);
    const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
    if (!order) throw new NotFoundError("Subscription not found");
    const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
    if (!week) throw new NotFoundError("Menu week not found");
    const result = await selectionsService.applyToWeek({
      order, menuWeek: week, slot: input.slot, personIndex: input.personIndex,
      pickIndex: input.pickIndex ?? 1, dishPublicId: input.dishId, actorId,
    });
    revalidatePath("/me");
    revalidatePath(`/dashboard/orders/${input.orderId}`);
    return { applied: result.applied, skipped: result.skipped };
  } catch (e) {
    if (e instanceof AppError) return { error: e.message };
    throw e;
  }
}
