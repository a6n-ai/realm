"use server";

import { revalidatePath } from "next/cache";
import { NotFoundError } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import { assertOwnsOrder } from "@/lib/services/customer-deliveries.service";
import { selectionsService } from "@/lib/menu/selections.service";

async function me(): Promise<bigint> {
  const id = await currentUserId();
  if (id == null) throw new NotFoundError("Not signed in");
  return id;
}

export async function pickMyDish(input: {
  orderId: string; menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string; personIndex: number; pickIndex?: number; dishId: string;
}): Promise<void> {
  const userId = await me();
  await assertOwnsOrder(userId, input.orderId); // IDOR gate before the mutation
  const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  if (!order) throw new NotFoundError("Subscription not found");
  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
  if (!week) throw new NotFoundError("Menu week not found");
  await selectionsService.setSelection({
    order, menuWeek: week, dayOfWeek: input.dayOfWeek, slot: input.slot,
    personIndex: input.personIndex, pickIndex: input.pickIndex ?? 1, dishPublicId: input.dishId,
  });
  revalidatePath("/me/meals");
}

export async function applyMyDishToWeek(input: {
  orderId: string; menuWeekId: string; slot: string; personIndex: number; pickIndex?: number; dishId: string;
}): Promise<{ applied: number; skipped: string[] }> {
  const userId = await me();
  await assertOwnsOrder(userId, input.orderId);
  const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  if (!order) throw new NotFoundError("Subscription not found");
  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
  if (!week) throw new NotFoundError("Menu week not found");
  const result = await selectionsService.applyToWeek({
    order, menuWeek: week, slot: input.slot, personIndex: input.personIndex,
    pickIndex: input.pickIndex ?? 1, dishPublicId: input.dishId,
  });
  revalidatePath("/me/meals");
  // selectionsService.applyToWeek's skipped entries are { dateIso, reason }; the
  // interface here declares skipped: string[] — flatten to the date so callers
  // get a simple list without depending on the service's internal shape.
  return { applied: result.applied, skipped: result.skipped.map((s) => s.dateIso) };
}
