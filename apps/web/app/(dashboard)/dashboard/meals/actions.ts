"use server";

import { revalidatePath } from "next/cache";
import { AuthError, ValidationError } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { menuWeeks, orders, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { selectionsService } from "@/lib/menu/selections.service";

export async function pickDish(input: {
  orderId: string;
  menuWeekId: string;
  dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string;
  personIndex: number;
  dishId: string;
}) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();

  // Order and menu-week lookups are independent — start both, then gate on order
  // for the auth check. Guard the early-started week query against the throw paths.
  const orderP = db.select().from(orders).where(eq(orders.publicId, input.orderId)).limit(1);
  const weekP = db.select().from(menuWeeks).where(eq(menuWeeks.publicId, input.menuWeekId)).limit(1);

  const [order] = await orderP;
  if (!order) { void weekP.catch(() => {}); throw new ValidationError("Order not found"); }

  const isStaff = session.user.role === "admin" || session.user.role === "member";
  if (!isStaff) {
    const [actor] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1);
    if (!actor || order.userId !== actor.id) { void weekP.catch(() => {}); throw new AuthError(); }
  }

  const [week] = await weekP;
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
  revalidatePath(`/dashboard/orders/${input.orderId}`);
}
