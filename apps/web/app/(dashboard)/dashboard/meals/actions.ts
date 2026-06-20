"use server";

import { revalidatePath } from "next/cache";
import { AuthError, ValidationError } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders, users } from "@/db/schema";
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

  const [order] = await db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  if (!order) throw new ValidationError("Order not found");

  const isStaff = session.user.role === "admin" || session.user.role === "member";
  if (!isStaff) {
    const [actor] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1);
    if (!actor || order.userId !== actor.id) throw new AuthError();
  }

  const [week] = await db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);
  if (!week) throw new ValidationError("Menu week not found");

  await selectionsService.setSelection({
    order,
    menuWeek: week,
    dayOfWeek: input.dayOfWeek,
    slot: input.slot,
    personIndex: input.personIndex,
    dishPublicId: input.dishId,
  });
  revalidatePath("/dashboard/meals");
}
