"use server";

import { revalidatePath } from "next/cache";
import { AuthError, ValidationError } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders } from "@/db/schema";
import { auth } from "@/lib/auth";
import { selectionsService } from "@/lib/menu/selections.service";

export async function pickDish(input: {
  orderId: string;
  menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string;
  personIndex: number;
  dishId: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new AuthError();
  const [order] = await db.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
  if (!order) throw new ValidationError("Order not found");
  const isStaff = session.user.role === "admin" || session.user.role === "member";
  if (order.userId !== session.user.id && !isStaff) throw new AuthError();
  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.id, input.menuWeekId)).limit(1);
  if (!week) throw new ValidationError("Menu week not found");
  await selectionsService.setSelection({
    order,
    menuWeek: week,
    dayOfWeek: input.dayOfWeek,
    slot: input.slot,
    personIndex: input.personIndex,
    dishId: input.dishId,
  });
  revalidatePath("/dashboard/meals");
}
